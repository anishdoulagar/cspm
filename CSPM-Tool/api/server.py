"""
CSPM FastAPI Backend — api/server.py
Step 4: /dashboard endpoint added.
All previous endpoints preserved.
"""

import sys
import os
import json
import asyncio
import secrets
import logging
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from functools import partial

from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import init_db, close_db, get_conn, get_pool
from database.models import (
    create_user, get_user_by_email, get_user_by_id, get_user_count,
    update_user_role, update_user_meta, update_user_password, delete_user,
    create_reset_token, get_reset_token, mark_reset_token_used,
    create_account, get_accounts_for_user, get_account,
    get_account_with_creds, update_account, delete_account,
    update_account_last_scanned,
    save_scan_result, get_scans_for_user, get_scan_by_id,
    upsert_finding_status, get_finding_statuses_for_user,
    get_all_users, get_platform_stats,
    upsert_alert_settings, get_alert_settings,
    get_all_alert_settings_for_user, get_alert_history_for_user,
    save_alert_history, get_alert_settings_for_account,
    get_all_alert_settings_for_account,
    get_system_alert_settings, upsert_system_alert_settings,
    log_action, get_audit_log,
    get_user_by_username,
    create_invite_token, get_invite_token, mark_invite_used,
)
from auth.password     import hash_password, verify_password
from auth.jwt_handler  import create_token
from auth.dependencies import get_current_user, require_admin, require_role
from auth.encryption   import encrypt_credentials, decrypt_credentials
from connectors.aws_connector   import AWSConnector
from connectors.azure_connector import AzureConnector
from translator.normalizer      import normalize_all
from policies.aws_rules         import AWS_RULES, check_aws_resources
from policies.azure_rules       import AZURE_RULES, check_azure_resources
from policies.custom_rules      import (
    load_custom_rules, save_custom_rule,
    delete_custom_rule, ALLOWED_FIELDS, OPERATORS,
)
from scoring.risk_scorer import score_resources, score_cloud, blend_cloud_scores, unified_score
from scheduler.engine import start_scheduler, stop_scheduler, register_account
from notifications.email_engine import is_email_configured

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── User-friendly error sanitizer ─────────────────────────────────────────────

def _friendly_cloud_error(e: Exception, cloud: str = "") -> str:
    """Convert raw SDK exceptions into concise, user-friendly messages."""
    msg = str(e)
    t   = type(e).__name__

    # ── AWS / botocore errors ───────────────────────────────────────────────
    if "InvalidClientTokenId" in msg or "InvalidClientTokenId" in t:
        return "AWS credentials are invalid. Please check your Access Key ID."
    if "SignatureDoesNotMatch" in msg:
        return "AWS Secret Access Key is incorrect. Please verify your credentials."
    if "AuthFailure" in msg:
        return "AWS authentication failed. Ensure your credentials have the correct permissions."
    if "NoCredentialsError" in t or "Unable to locate credentials" in msg:
        return "AWS credentials not found. Please provide a valid Access Key ID and Secret."
    if "EndpointResolutionError" in t or "Could not connect to the endpoint" in msg:
        return "Cannot reach the AWS endpoint. Check your region setting and network connectivity."
    if "ClientError" in t and "AccessDenied" in msg:
        return "AWS access denied. Ensure the IAM user has the required read permissions."
    if "ClientError" in t and "ExpiredToken" in msg:
        return "AWS session token has expired. Please refresh your credentials."
    if "ClientError" in t:
        # Extract the message portion from botocore ClientError
        try:
            inner = msg.split(":", 1)[1].strip() if ":" in msg else msg
            return f"AWS error: {inner.split('(')[0].strip()}"
        except Exception:
            return "An AWS error occurred. Please verify your credentials and permissions."

    # ── Azure errors ────────────────────────────────────────────────────────
    if "ClientAuthenticationError" in t or "AADSTS" in msg:
        return "Azure authentication failed. Check your Tenant ID, Client ID, and Client Secret."
    if "ResourceNotFoundError" in t:
        return "Azure resource not found. Verify your Subscription ID."
    if "HttpResponseError" in t and "AuthorizationFailed" in msg:
        return "Azure access denied. Ensure the service principal has Reader permissions on the subscription."
    if "HttpResponseError" in t:
        try:
            inner = msg.split(":", 1)[1].strip() if ":" in msg else msg
            return f"Azure error: {inner[:120]}"
        except Exception:
            return "An Azure error occurred. Please verify your credentials and subscription ID."

    # ── Generic network / timeout ───────────────────────────────────────────
    if "ConnectionError" in t or "ConnectTimeout" in t or "TimeoutError" in t:
        return "Connection timed out. Check your network connectivity and firewall settings."

    # ── Fallback — log full error but return generic message ────────────────
    logger.warning("Unclassified cloud error [%s %s]: %s", cloud, t, msg)
    return "An unexpected error occurred while connecting to your cloud account. Please verify your credentials."


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CSPM backend...")
    await init_db()
    # Start background scheduler after DB is ready
    pool = await get_pool()
    await start_scheduler(pool)
    logger.info("CSPM backend ready.")
    yield
    await stop_scheduler()
    await close_db()


app = FastAPI(title="Multi-Cloud CSPM", version="3.0.0 + scheduler", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request Models ────────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    username: str
    email:    str
    password: str
    name:     str = ""

class LoginRequest(BaseModel):
    username: str
    password: str

class AWSCredentials(BaseModel):
    access_key_id:     str
    secret_access_key: str
    region:            str = "us-east-1"

class AzureCredentials(BaseModel):
    subscription_id: str
    tenant_id:       str
    client_id:       str
    client_secret:   str

class TestConnectionRequest(BaseModel):
    cloud: str
    aws:   Optional[AWSCredentials] = None
    azure: Optional[AzureCredentials] = None

class AdHocScanRequest(BaseModel):
    cloud: str
    aws:   Optional[AWSCredentials] = None
    azure: Optional[AzureCredentials] = None

class CreateAccountRequest(BaseModel):
    name:                str
    cloud:               str
    scan_interval_hours: float = 24
    category:            Optional[str] = "General"
    access_key_id:       Optional[str] = None
    secret_access_key:   Optional[str] = None
    region:              Optional[str] = "us-east-1"
    subscription_id:     Optional[str] = None
    tenant_id:           Optional[str] = None
    client_id:           Optional[str] = None
    client_secret:       Optional[str] = None

class UpdateAccountRequest(BaseModel):
    name:                str
    scan_interval_hours: float = 24
    category:            Optional[str] = "General"

class FindingStatusUpdate(BaseModel):
    finding_key: str
    status:      str

class CustomRuleCreate(BaseModel):
    rule_id:     str
    cloud:       str
    service:     str
    severity:    str
    title:       str
    field:       str
    operator:    str
    value:       str  = ""
    message:     str
    remediation: str
    frameworks:  list = ["CUSTOM"]

class AlertSettingsRequest(BaseModel):
    account_id:           str
    email:                str
    score_threshold:      int  = 70
    alert_on_critical:    bool = True
    alert_on_high:        bool = False
    alert_on_medium:      bool = False
    alert_on_new_finding: bool = False
    enabled:              bool = True

    def validate_threshold(self):
        if not (0 <= self.score_threshold <= 100):
            raise ValueError("score_threshold must be between 0 and 100")


class SystemAlertSettingsRequest(BaseModel):
    email:           str
    score_threshold: int  = 60
    enabled:         bool = True

    def validate_threshold(self):
        if not (0 <= self.score_threshold <= 100):
            raise ValueError("score_threshold must be between 0 and 100")

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str

class UpdateRoleRequest(BaseModel):
    role: str

class AdminInviteRequest(BaseModel):
    email:       str
    role:        str           = "analyst"

class AcceptInviteRequest(BaseModel):
    token:    str
    name:     str
    username: str
    password: str

class PatchUserRequest(BaseModel):
    is_active:   Optional[bool] = None
    valid_until: Optional[str]  = None   # ISO date string or "" to clear


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_response(user: dict, token: str) -> dict:
    return {
        "token": token,
        "user": {
            "id":          str(user["id"]),
            "email":       user["email"],
            "name":        user["name"],
            "is_admin":    user["is_admin"],
            "role":        user.get("role", "analyst"),
            "is_active":   user.get("is_active", True),
            "valid_until": user["valid_until"].isoformat() if user.get("valid_until") else None,
        },
    }


def _safe_account(account: dict) -> dict:
    return {k: v for k, v in account.items() if k != "encrypted_creds"}


async def _run_scan_engine(cloud: str, aws_creds: dict = None,
                            azure_creds: dict = None,
                            timeout_seconds: int = 600) -> dict:
    """
    Runs the scan engine with full parallelism:
    - AWS and Azure data collection run concurrently
    - All service collectors within each cloud run concurrently (ThreadPoolExecutor inside connectors)
    - AWS and Azure policy evaluation run concurrently
    Hard timeout of 10 min per scan.
    """
    loop = asyncio.get_event_loop()

    # ── Build collection tasks ───────────────────────────────────────────────
    collect_tasks = []
    task_labels   = []

    if cloud in ("aws", "all") and aws_creds:
        aws_connector = AWSConnector(
            aws_access_key_id=aws_creds["access_key_id"],
            aws_secret_access_key=aws_creds["secret_access_key"],
            region_name=aws_creds.get("region", "us-east-1"),
        )
        collect_tasks.append(loop.run_in_executor(None, aws_connector.collect_all))
        task_labels.append("aws")

    if cloud in ("azure", "all") and azure_creds:
        azure_connector = AzureConnector(
            subscription_id=azure_creds["subscription_id"],
            tenant_id=azure_creds["tenant_id"],
            client_id=azure_creds["client_id"],
            client_secret=azure_creds["client_secret"],
        )
        collect_tasks.append(loop.run_in_executor(None, azure_connector.collect_all))
        task_labels.append("azure")

    # ── Run AWS + Azure collection concurrently ──────────────────────────────
    try:
        collected = await asyncio.wait_for(
            asyncio.gather(*collect_tasks),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(
            f"Scan timed out after {timeout_seconds}s. "
            "Check cloud provider connectivity and permissions."
        )

    raw_by_cloud = dict(zip(task_labels, collected))
    aws_raw   = raw_by_cloud.get("aws")
    azure_raw = raw_by_cloud.get("azure")

    # ── Normalize ────────────────────────────────────────────────────────────
    resources = normalize_all(aws_raw or {}, azure_raw or {})

    # ── Run AWS + Azure policy evaluation concurrently ───────────────────────
    eval_tasks = []
    eval_labels = []
    if aws_raw:
        eval_tasks.append(loop.run_in_executor(None, check_aws_resources, resources))
        eval_labels.append("aws")
    if azure_raw:
        eval_tasks.append(loop.run_in_executor(None, check_azure_resources, resources))
        eval_labels.append("azure")

    evaluated = await asyncio.gather(*eval_tasks)
    findings_by_cloud = dict(zip(eval_labels, evaluated))

    all_findings = []
    for findings in findings_by_cloud.values():
        all_findings.extend(findings)

    finding_map = {}
    for f in all_findings:
        finding_map.setdefault(f.resource_id, []).append(f)
    for resource in resources:
        resource.findings = finding_map.get(resource.resource_id, [])

    scored = score_resources(resources)

    scores = {}
    if aws_raw:
        aws_res = [r for r in scored if r.cloud == "aws"]
        if aws_res:
            scores["aws"] = score_cloud(aws_res)
    if azure_raw:
        az_res = [r for r in scored if r.cloud == "azure"]
        if az_res:
            scores["azure"] = score_cloud(az_res)
    scores["overall"] = blend_cloud_scores(
        {k: v for k, v in scores.items() if k in ("aws", "azure")}
    )

    findings_out = [
        {
            "rule_id":       f.rule_id,
            "resource_id":   f.resource_id,
            "resource_name": f.resource_name,
            "severity":      f.severity,
            "message":       f.message,
            "remediation":   f.remediation,
            "cloud":         f.cloud,
            "service":       f.service,
            "frameworks":    f.frameworks,
            "is_custom":     f.is_custom,
            "status":        f.status,
        }
        for f in all_findings
    ]

    return {
        "scores":            scores,
        "findings":          findings_out,
        "finding_counts": {
            "critical": sum(1 for f in all_findings if f.severity == "CRITICAL"),
            "high":     sum(1 for f in all_findings if f.severity == "HIGH"),
            "medium":   sum(1 for f in all_findings if f.severity == "MEDIUM"),
            "low":      sum(1 for f in all_findings if f.severity == "LOW"),
        },
        "resources_scanned": len(resources),
        "cloud":             cloud,
    }


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.0.0"}


@app.get("/auth/setup-status")
async def setup_status(conn=Depends(get_conn)):
    """Returns whether any users exist. Used to show first-run setup prompt."""
    count = await get_user_count(conn)
    return {"needs_setup": count == 0}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(req: SignupRequest, conn=Depends(get_conn)):
    if not req.username or not req.username.strip():
        raise HTTPException(status_code=422, detail="Username is required.")
    if len(req.username.strip()) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters.")
    if await get_user_by_username(conn, req.username):
        raise HTTPException(status_code=409, detail="Username already taken.")
    if await get_user_by_email(conn, req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    if len(req.password.encode()) > 72:
        raise HTTPException(status_code=422, detail="Password must be 72 characters or fewer.")

    # First user ever → automatically becomes superadmin
    is_first_user = (await get_user_count(conn)) == 0

    hashed = hash_password(req.password)
    user   = await create_user(conn, req.email, hashed,
                                req.name or req.username,
                                username=req.username)

    if is_first_user:
        user = await update_user_role(conn, str(user["id"]), "superadmin")

    token = create_token(str(user["id"]), user["email"],
                         user["is_admin"], user.get("role", "analyst"))
    return _user_response(user, token)


@app.post("/auth/login")
async def login(req: LoginRequest, request: Request, conn=Depends(get_conn)):
    user   = await get_user_by_username(conn, req.username)
    dummy  = "$2b$12$dummy.hash.to.prevent.timing.attacks.padding.xyz"
    stored = user["password_hash"] if user else dummy
    if not user or not verify_password(req.password, stored):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account has been disabled. Contact your administrator.")

    valid_until = user.get("valid_until")
    if valid_until is not None:
        if valid_until.tzinfo is None:
            valid_until = valid_until.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > valid_until:
            raise HTTPException(status_code=403, detail="Your account access has expired. Contact your administrator.")

    token = create_token(str(user["id"]), user["email"],
                         user["is_admin"], user.get("role", "analyst"))
    try:
        await log_action(conn, str(user["id"]), user["email"], "login",
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return _user_response(user, token)


@app.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {"id": str(user["id"]), "email": user["email"],
            "name": user["name"], "is_admin": user["is_admin"],
            "role": user.get("role", "analyst")}


@app.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, conn=Depends(get_conn)):
    """
    Generates a password reset token and sends an email.
    Always returns 200 to avoid email enumeration.
    """
    from notifications.email_engine import send_password_reset_email, is_email_configured

    user = await get_user_by_email(conn, req.email)
    if user and is_email_configured():
        token      = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await create_reset_token(conn, str(user["id"]), token, expires_at)

        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
        reset_url    = f"{frontend_url}?reset_token={token}"
        send_password_reset_email(req.email, reset_url)

    return {"status": "ok", "message": "If that email exists, a reset link has been sent."}


@app.post("/auth/reset-password")
async def reset_password(req: ResetPasswordRequest, conn=Depends(get_conn)):
    """Validates a reset token and updates the user's password."""
    record = await get_reset_token(conn, req.token)
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
    if record["used"]:
        raise HTTPException(status_code=400, detail="Reset token has already been used.")

    now = datetime.now(timezone.utc)
    expires = record["expires_at"]
    # asyncpg may return naive datetime — make it timezone-aware
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    if len(req.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    hashed = hash_password(req.new_password)
    await update_user_password(conn, str(record["user_id"]), hashed)
    await mark_reset_token_used(conn, str(record["id"]))
    return {"status": "ok", "message": "Password updated successfully."}


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/dashboard")
async def get_dashboard(
    days: Optional[int] = None,
    user: dict = Depends(get_current_user),
    conn=Depends(get_conn),
):
    """
    Returns everything the Dashboard page needs in a single request:
    - All accounts with their latest scan scores
    - Aggregate stats across all accounts
    - Last 10 scans for trend chart
    - Top 10 most recent critical/high findings across all accounts
    """
    user_id  = str(user["id"])
    since    = datetime.now(timezone.utc) - timedelta(days=days) if days else None
    accounts = await get_accounts_for_user(conn, user_id)
    scans    = await get_scans_for_user(conn, user_id, limit=50, since=since)

    # ── Per-account latest score ───────────────────────────────────────────
    # Build a map of account_id → most recent scan
    latest_scan_per_account = {}
    for scan in scans:
        acc_id = str(scan.get("account_id", "")) if scan.get("account_id") else None
        if acc_id and acc_id not in latest_scan_per_account:
            latest_scan_per_account[acc_id] = scan

    account_summaries = []
    for acc in accounts:
        acc_id   = str(acc["id"])
        latest   = latest_scan_per_account.get(acc_id)
        scores   = latest["scores"] if latest else {}
        fc       = latest["finding_counts"] if latest else {}
        account_summaries.append({
            "id":                   acc_id,
            "name":                 acc["name"],
            "cloud":                acc["cloud"],
            "region":               acc.get("region"),
            "category":             acc.get("category") or "General",
            "scan_interval_hours":  acc["scan_interval_hours"],
            "last_scanned_at":      acc["last_scanned_at"].isoformat()
                                    if acc.get("last_scanned_at") else None,
            "latest_score":         scores.get("overall") or scores.get("aws")
                                    or scores.get("azure"),
            "scores":               scores,
            "finding_counts":       fc,
        })

    # ── Aggregate stats ────────────────────────────────────────────────────
    scanned_accounts = [a for a in account_summaries if a["latest_score"] is not None]

    overall_score = None
    if scanned_accounts:
        overall_score = unified_score([a["latest_score"] for a in scanned_accounts])

    total_critical = sum(
        a["finding_counts"].get("critical", 0) for a in account_summaries
    )
    total_high = sum(
        a["finding_counts"].get("high", 0) for a in account_summaries
    )
    total_findings = sum(
        sum(a["finding_counts"].values()) for a in account_summaries
    )

    # ── Trend chart data (pivoted: one row per timestamp, one column per account)
    # scans is newest-first; reverse the slice to get chronological order
    trend_account_order: list[str] = []
    trend_pivot: dict[str, dict] = {}  # date_str → {account_name: score, ...}

    for scan in reversed(scans[:30]):
        date_key = scan["created_at"][:16].replace("T", " ")
        acc_name = scan.get("account_name") or "Ad-hoc"
        scores   = scan.get("scores", {})
        score_val = scores.get("overall") or scores.get("aws") or scores.get("azure")

        if acc_name not in trend_account_order:
            trend_account_order.append(acc_name)
        if date_key not in trend_pivot:
            trend_pivot[date_key] = {"date": date_key}
        # Keep the best (most recent for this date) score for this account
        if acc_name not in trend_pivot[date_key] or score_val is not None:
            trend_pivot[date_key][acc_name] = score_val

    trend = list(trend_pivot.values())

    # ── Recent findings: one bulk query fetching findings from the latest scan
    # per account (avoids N+1 round-trips to the database)
    seen_account_ids: set[str] = set()
    scan_ids_needed: list[str] = []
    scan_meta: dict[str, dict] = {}

    for scan in scans:
        acc_id = str(scan.get("account_id")) if scan.get("account_id") else None
        if not acc_id or acc_id in seen_account_ids:
            continue
        seen_account_ids.add(acc_id)
        sid = str(scan["id"])
        scan_ids_needed.append(sid)
        scan_meta[sid] = {
            "account_name": scan.get("account_name", "Unknown"),
            "scanned_at":   scan["created_at"][:16].replace("T", " "),
        }

    # Single bulk fetch for all needed scan findings.
    # Take up to PER_ACCOUNT findings per account so every account is
    # represented fairly regardless of how many other accounts exist.
    PER_ACCOUNT = 200
    TOTAL_CAP   = 1000
    sev_order   = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}

    recent_findings = []
    if scan_ids_needed:
        rows = await conn.fetch(
            """
            SELECT id, findings
            FROM scan_results
            WHERE id = ANY($1::uuid[])
            """,
            [sid for sid in scan_ids_needed],
        )
        findings_by_scan = {str(r["id"]): r["findings"] for r in rows}
        for sid in scan_ids_needed:
            meta     = scan_meta[sid]
            findings = findings_by_scan.get(sid) or []
            if isinstance(findings, str):
                import json as _json
                findings = _json.loads(findings)
            # Sort this account's findings by severity before slicing
            findings_sorted = sorted(
                findings,
                key=lambda f: sev_order.get(f.get("severity", "LOW"), 3)
            )
            for f in findings_sorted[:PER_ACCOUNT]:
                recent_findings.append({
                    **f,
                    "account_name": meta["account_name"],
                    "scanned_at":   meta["scanned_at"],
                })

    # Final sort across all accounts: CRITICAL first, then HIGH, MEDIUM, LOW
    recent_findings.sort(key=lambda f: sev_order.get(f.get("severity", "LOW"), 3))
    recent_findings = recent_findings[:TOTAL_CAP]

    return {
        "overall_score":    overall_score,
        "total_accounts":   len(accounts),
        "scanned_accounts": len(scanned_accounts),
        "total_findings":   total_findings,
        "total_critical":   total_critical,
        "total_high":       total_high,
        "accounts":         account_summaries,
        "trend":            trend,
        "trend_accounts":   trend_account_order,
        "recent_findings":  recent_findings,
    }


# ── Cloud Accounts ────────────────────────────────────────────────────────────

@app.get("/accounts")
async def list_accounts(user=Depends(get_current_user), conn=Depends(get_conn)):
    accounts = await get_accounts_for_user(conn, str(user["id"]))
    return {"accounts": [_safe_account(a) for a in accounts]}


@app.post("/accounts", status_code=201)
async def add_account(req: CreateAccountRequest, request: Request,
                       user=Depends(require_role("admin")), conn=Depends(get_conn)):
    if req.cloud == "aws":
        if not req.access_key_id or not req.secret_access_key:
            raise HTTPException(status_code=422,
                detail="AWS requires access_key_id and secret_access_key.")
        creds = {"access_key_id": req.access_key_id,
                 "secret_access_key": req.secret_access_key,
                 "region": req.region or "us-east-1"}
    elif req.cloud == "azure":
        if not all([req.subscription_id, req.tenant_id,
                    req.client_id, req.client_secret]):
            raise HTTPException(status_code=422,
                detail="Azure requires subscription_id, tenant_id, client_id, client_secret.")
        creds = {"subscription_id": req.subscription_id, "tenant_id": req.tenant_id,
                 "client_id": req.client_id, "client_secret": req.client_secret}
    else:
        raise HTTPException(status_code=422, detail="cloud must be 'aws' or 'azure'.")

    encrypted = encrypt_credentials(creds)
    account   = await create_account(
        conn, user_id=str(user["id"]), name=req.name, cloud=req.cloud,
        encrypted_creds=encrypted, region=req.region if req.cloud == "aws" else None,
        scan_interval_hours=req.scan_interval_hours,
        category=req.category or "General",
    )
    # Register with scheduler if interval > 0
    if req.scan_interval_hours > 0:
        pool = await get_pool()
        await register_account(pool, str(account["id"]), req.scan_interval_hours)

    try:
        await log_action(conn, str(user["id"]), user["email"], "create_account",
                         resource_type="account", resource_id=str(account["id"]),
                         resource_name=req.name, detail={"cloud": req.cloud},
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"account": _safe_account(account)}


@app.put("/accounts/{account_id}")
async def update_account_route(account_id: str, req: UpdateAccountRequest,
                                user=Depends(require_role("admin")), conn=Depends(get_conn)):
    account = await update_account(conn, account_id, str(user["id"]),
                                    req.name, req.scan_interval_hours,
                                    category=req.category or "General")
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    # Update scheduler with new interval
    pool = await get_pool()
    await register_account(pool, account_id, req.scan_interval_hours)

    return {"account": _safe_account(account)}


@app.delete("/accounts/{account_id}")
async def delete_account_route(account_id: str, request: Request,
                                user=Depends(require_role("admin")), conn=Depends(get_conn)):
    account = await get_account(conn, account_id, str(user["id"]))
    deleted = await delete_account(conn, account_id, str(user["id"]))
    if not deleted:
        raise HTTPException(status_code=404, detail="Account not found.")
    try:
        await log_action(conn, str(user["id"]), user["email"], "delete_account",
                         resource_type="account", resource_id=account_id,
                         resource_name=account["name"] if account else None,
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"status": "deleted"}


@app.post("/accounts/{account_id}/test")
async def test_saved_account(account_id: str,
                              user=Depends(get_current_user), conn=Depends(get_conn)):
    account = await get_account_with_creds(conn, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    creds = decrypt_credentials(account["encrypted_creds"])
    try:
        if account["cloud"] == "aws":
            AWSConnector(aws_access_key_id=creds["access_key_id"],
                         aws_secret_access_key=creds["secret_access_key"],
                         region_name=creds.get("region","us-east-1")).test_connection()
        else:
            AzureConnector(subscription_id=creds["subscription_id"],
                           tenant_id=creds["tenant_id"], client_id=creds["client_id"],
                           client_secret=creds["client_secret"]).test_connection()
        return {"status": "connected"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=_friendly_cloud_error(e, account["cloud"]))


@app.post("/accounts/{account_id}/scan")
async def scan_saved_account(account_id: str, request: Request,
                              user=Depends(require_role("analyst")), conn=Depends(get_conn)):
    account = await get_account_with_creds(conn, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    creds = decrypt_credentials(account["encrypted_creds"])
    cloud = account["cloud"]
    try:
        result = await _run_scan_engine(
            cloud=cloud,
            aws_creds=creds   if cloud == "aws"   else None,
            azure_creds=creds if cloud == "azure" else None,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=_friendly_cloud_error(e, cloud))
    saved = await save_scan_result(
        conn, user_id=str(user["id"]), account_id=account_id,
        cloud=cloud, scores=result["scores"],
        resources_scanned=result["resources_scanned"],
        finding_counts=result["finding_counts"],
        findings=result["findings"], triggered_by="manual",
    )
    await update_account_last_scanned(conn, account_id)
    result["scan_id"]      = str(saved["id"])
    result["account_name"] = account["name"]
    result["triggered_by"] = "manual"

    # ── Trigger alert emails if conditions are met ────────────────────────────
    try:
        from notifications.email_engine import (
            build_alert_email, send_alert_email, is_email_configured,
        )
        if is_email_configured():
            all_cfgs = await get_all_alert_settings_for_account(conn, account_id)
            overall_score = (result.get("scores") or {})
            overall_score = (overall_score.get("overall") or overall_score.get("aws")
                             or overall_score.get("azure") or 100)
            fc = result.get("finding_counts", {})
            new_findings = (result.get("diff") or {}).get("new_findings", [])

            for alert_cfg in all_cfgs:
                should_alert   = False
                trigger_reason = ""
                if overall_score <= alert_cfg["score_threshold"]:
                    should_alert   = True
                    trigger_reason = (f"Score {overall_score} ≤ threshold "
                                      f"{alert_cfg['score_threshold']}")
                if alert_cfg["alert_on_critical"] and fc.get("critical", 0) > 0:
                    should_alert   = True
                    trigger_reason = f"{fc['critical']} CRITICAL finding(s) detected"
                if alert_cfg["alert_on_high"] and fc.get("high", 0) > 0:
                    should_alert   = True
                    trigger_reason = f"{fc['high']} HIGH finding(s) detected"
                if alert_cfg.get("alert_on_medium") and fc.get("medium", 0) > 0:
                    should_alert   = True
                    trigger_reason = f"{fc['medium']} MEDIUM finding(s) detected"
                if alert_cfg.get("alert_on_new_finding") and len(new_findings) > 0:
                    should_alert   = True
                    trigger_reason = f"{len(new_findings)} new finding(s) since last scan"
                if should_alert:
                    subject, html = build_alert_email(
                        account_name=account["name"], cloud=cloud,
                        score=overall_score, threshold=alert_cfg["score_threshold"],
                        findings=result.get("findings", []),
                    )
                    sent = send_alert_email(alert_cfg["email"], subject, html)
                    await save_alert_history(
                        conn, user_id=str(alert_cfg["user_id"]), account_id=account_id,
                        account_name=account["name"], score=overall_score,
                        trigger=trigger_reason, email_sent=sent,
                    )
        # ── System-wide alert check ──────────────────────────────────────────
        try:
            sys_cfg = await get_system_alert_settings(conn)
            if sys_cfg and sys_cfg.get("enabled"):
                # Compute current overall platform score from latest scans
                all_scans = await get_scans_for_user(conn, str(user["id"]))
                seen_accounts: set = set()
                latest_scores: list = []
                for sc in all_scans:
                    aid = str(sc.get("account_id", ""))
                    if aid not in seen_accounts:
                        seen_accounts.add(aid)
                        s = sc.get("scores") or {}
                        overall = s.get("overall") or s.get("aws") or s.get("azure") or 0
                        latest_scores.append(overall)
                if latest_scores:
                    platform_score = sum(latest_scores) / len(latest_scores)
                    if platform_score <= sys_cfg["score_threshold"]:
                        from notifications.email_engine import build_alert_email, send_alert_email, is_email_configured
                        if is_email_configured():
                            subject = f"[VANGUARD] Platform Alert — Overall posture {platform_score:.0f}/100"
                            _, body = build_alert_email(
                                account_name="Platform-Wide",
                                cloud="platform",
                                score=int(platform_score),
                                threshold=sys_cfg["score_threshold"],
                                findings=[],
                            )
                            send_alert_email(sys_cfg["email"], subject, body)
        except Exception:
            pass
    except Exception:
        pass  # Never let alert failures break the scan response

    try:
        overall = (result.get("scores") or {})
        overall_score = overall.get("overall") or overall.get("aws") or overall.get("azure") or 100
        await log_action(conn, str(user["id"]), user["email"], "scan_account",
                         resource_type="account", resource_id=account_id,
                         resource_name=account["name"],
                         detail={"cloud": cloud, "score": overall_score,
                                 "findings": result.get("finding_counts", {})},
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass

    return result


# ── Bulk Scan All Accounts ─────────────────────────────────────────────────────

@app.post("/accounts/scan-all")
async def scan_all_accounts(
    user=Depends(require_role("analyst")),
    conn=Depends(get_conn),
):
    """
    Scans all saved accounts concurrently (max 5 at a time) to avoid
    rate-limiting while still being faster than purely sequential.
    Returns a summary of results.
    """
    accounts = await get_accounts_for_user(conn, str(user["id"]))
    if not accounts:
        return {"results": [], "success_count": 0, "fail_count": 0}

    semaphore = asyncio.Semaphore(5)  # max 5 concurrent cloud scans
    pool      = await get_pool()

    async def _scan_one(account):
        account_id = str(account["id"])
        cloud      = account["cloud"]
        async with semaphore:
            try:
                creds  = decrypt_credentials(account["encrypted_creds"])
                result = await _run_scan_engine(
                    cloud=cloud,
                    aws_creds=creds   if cloud == "aws"   else None,
                    azure_creds=creds if cloud == "azure" else None,
                )
                async with pool.acquire() as c:
                    await save_scan_result(
                        c, user_id=str(user["id"]), account_id=account_id,
                        cloud=cloud, scores=result["scores"],
                        resources_scanned=result["resources_scanned"],
                        finding_counts=result["finding_counts"],
                        findings=result["findings"], triggered_by="bulk_manual",
                    )
                    await update_account_last_scanned(c, account_id)
                overall_s = result.get("scores") or {}
                overall_score = (overall_s.get("overall") or
                                 overall_s.get("aws") or overall_s.get("azure"))
                return {
                    "account_id": account_id, "account_name": account["name"],
                    "cloud": cloud, "status": "success", "score": overall_score,
                }
            except Exception as e:
                logger.warning(f"bulk_scan failed for {account['name']}: {e}")
                return {
                    "account_id": account_id, "account_name": account["name"],
                    "cloud": cloud, "status": "error", "error": str(e),
                }

    results = await asyncio.gather(*[_scan_one(a) for a in accounts])

    success_count = sum(1 for r in results if r["status"] == "success")
    fail_count    = sum(1 for r in results if r["status"] == "error")

    try:
        await log_action(conn, str(user["id"]), user["email"], "bulk_scan",
                         detail={"accounts": len(accounts), "success": success_count, "failed": fail_count})
    except Exception:
        pass

    return {"results": results, "success_count": success_count, "fail_count": fail_count}


# ── Scan History ──────────────────────────────────────────────────────────────

@app.get("/scans")
async def list_scans(account_id: Optional[str] = None, limit: int = 20,
                      user=Depends(get_current_user), conn=Depends(get_conn)):
    scans = await get_scans_for_user(conn, str(user["id"]), account_id, limit)
    return {"scans": scans}


@app.get("/scans/{scan_id}")
async def get_scan(scan_id: str, user=Depends(get_current_user), conn=Depends(get_conn)):
    scan = await get_scan_by_id(conn, scan_id, str(user["id"]))
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # ── Compute diff against the previous scan for this account ───────────────
    if scan.get("account_id"):
        prev_row = await conn.fetchrow(
            """
            SELECT id, findings, created_at FROM scan_results
            WHERE account_id = $1 AND created_at < $2
            ORDER BY created_at DESC LIMIT 1
            """,
            scan["account_id"],
            scan["created_at"] if not isinstance(scan["created_at"], str)
                else datetime.fromisoformat(scan["created_at"].replace("Z", "+00:00")),
        )
        if prev_row:
            import json as _json
            prev_findings = prev_row["findings"]
            if isinstance(prev_findings, str):
                prev_findings = _json.loads(prev_findings)

            cur_keys  = {f"{f['rule_id']}::{f['resource_id']}" for f in (scan.get("findings") or [])}
            prev_keys = {f"{f['rule_id']}::{f['resource_id']}" for f in (prev_findings or [])}

            new_findings      = [f for f in (scan.get("findings") or [])
                                  if f"{f['rule_id']}::{f['resource_id']}" in cur_keys - prev_keys]
            resolved_findings = [f for f in (prev_findings or [])
                                  if f"{f['rule_id']}::{f['resource_id']}" in prev_keys - cur_keys]

            prev_date = prev_row["created_at"]
            scan["diff"] = {
                "new_count":       len(new_findings),
                "resolved_count":  len(resolved_findings),
                "new_findings":    new_findings,
                "resolved_findings": resolved_findings,
                "previous_scan_id":   str(prev_row["id"]),
                "previous_scan_date": prev_date.isoformat() if hasattr(prev_date, "isoformat") else str(prev_date),
            }

    return scan


# ── Scan Report Download ───────────────────────────────────────────────────────

@app.get("/scans/{scan_id}/report")
async def download_scan_report(
    scan_id: str,
    format: str = "csv",
    user=Depends(get_current_user),
    conn=Depends(get_conn),
):
    """
    Download a scan report as CSV or JSON.
    CSV columns: severity, rule_id, service, resource_name, resource_id, cloud, message, remediation, frameworks, status
    """
    from fastapi.responses import StreamingResponse
    import io, csv as _csv, json as _json

    scan = await get_scan_by_id(conn, scan_id, str(user["id"]))
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found.")

    findings  = scan.get("findings") or []
    account   = (scan.get("account_name") or "scan").replace(" ", "-")
    date_str  = (scan.get("created_at") or "")[:10]
    filename  = f"cspm-{account}-{date_str}"

    if format == "json":
        content = _json.dumps({
            "scan_id":          scan_id,
            "account":          scan.get("account_name"),
            "cloud":            scan.get("cloud"),
            "created_at":       scan.get("created_at"),
            "scores":           scan.get("scores"),
            "resources_scanned": scan.get("resources_scanned"),
            "finding_counts":   scan.get("finding_counts"),
            "findings":         findings,
        }, indent=2)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
        )

    # CSV (default)
    output = io.StringIO()
    writer = _csv.writer(output)
    writer.writerow([
        "severity", "rule_id", "service", "resource_name", "resource_id",
        "cloud", "message", "remediation", "frameworks", "status",
    ])
    for f in findings:
        writer.writerow([
            f.get("severity", ""),
            f.get("rule_id", ""),
            f.get("service", ""),
            f.get("resource_name", ""),
            f.get("resource_id", ""),
            f.get("cloud", ""),
            f.get("message", ""),
            f.get("remediation", ""),
            "|".join(f.get("frameworks") or []),
            f.get("status", "open"),
        ])

    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


# ── Finding Status ────────────────────────────────────────────────────────────

@app.post("/finding-status")
async def update_status(req: FindingStatusUpdate,
                         user=Depends(require_role("analyst")), conn=Depends(get_conn)):
    await upsert_finding_status(conn, str(user["id"]), req.finding_key, req.status)
    return {"status": "updated"}


# ── Ad-hoc Scan ───────────────────────────────────────────────────────────────

@app.post("/scan")
async def adhoc_scan(req: AdHocScanRequest, user=Depends(require_role("analyst"))):
    try:
        return await _run_scan_engine(
            cloud=req.cloud,
            aws_creds=req.aws.dict()    if req.aws    else None,
            azure_creds=req.azure.dict() if req.azure else None,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=_friendly_cloud_error(e, req.cloud))


# ── Test Connection ───────────────────────────────────────────────────────────

@app.post("/test-connection")
async def test_connection(req: TestConnectionRequest):
    results, errors = {}, {}
    if req.cloud in ("aws","all") and req.aws:
        try:
            AWSConnector(aws_access_key_id=req.aws.access_key_id,
                         aws_secret_access_key=req.aws.secret_access_key,
                         region_name=req.aws.region).test_connection()
            results["aws"] = "connected"
        except Exception as e:
            errors["aws"] = _friendly_cloud_error(e, "aws")
    if req.cloud in ("azure","all") and req.azure:
        try:
            AzureConnector(subscription_id=req.azure.subscription_id,
                           tenant_id=req.azure.tenant_id, client_id=req.azure.client_id,
                           client_secret=req.azure.client_secret).test_connection()
            results["azure"] = "connected"
        except Exception as e:
            errors["azure"] = _friendly_cloud_error(e, "azure")
    if errors:
        # Convert dict errors to a single readable string for the UI
        msg = " | ".join(f"{k.upper()}: {v}" for k, v in errors.items())
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "connections": results}


# ── Policies ──────────────────────────────────────────────────────────────────

@app.get("/policies")
async def get_policies():
    all_rules = []
    for rule in AWS_RULES:
        all_rules.append({**rule, "cloud": "aws", "is_custom": False})
    for rule in AZURE_RULES:
        all_rules.append({**rule, "cloud": "azure", "is_custom": False})
    for rule in load_custom_rules():
        all_rules.append({**rule, "is_custom": True})
    stats = {
        "total":    len(all_rules), "aws": len(AWS_RULES), "azure": len(AZURE_RULES),
        "custom":   len(load_custom_rules()),
        "critical": sum(1 for r in all_rules if r.get("severity") == "CRITICAL"),
        "high":     sum(1 for r in all_rules if r.get("severity") == "HIGH"),
        "medium":   sum(1 for r in all_rules if r.get("severity") == "MEDIUM"),
        "low":      sum(1 for r in all_rules if r.get("severity") == "LOW"),
    }
    fw = {}
    for rule in all_rules:
        for f in rule.get("frameworks", []):
            p = f.split("-")[0]; fw[p] = fw.get(p, 0) + 1
    return {"rules": all_rules, "stats": stats, "frameworks": fw}


@app.get("/custom-rules")
async def list_custom_rules():
    return {"rules": load_custom_rules()}


@app.post("/custom-rules")
async def create_custom_rule(rule: CustomRuleCreate,
                              user=Depends(require_role("analyst"))):
    try:
        save_custom_rule(rule.dict())
        return {"status": "created", "rule_id": rule.rule_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/custom-rules/{rule_id}")
async def delete_rule(rule_id: str, user=Depends(require_role("analyst"))):
    if not delete_custom_rule(rule_id):
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found.")
    return {"status": "deleted", "rule_id": rule_id}


# ── Alerts ────────────────────────────────────────────────────────────────────

@app.get("/alerts/settings")
async def list_alert_settings(user=Depends(get_current_user), conn=Depends(get_conn)):
    """Get all alert configurations for the current user."""
    settings = await get_all_alert_settings_for_user(conn, str(user["id"]))
    return {
        "settings":        settings,
        "email_configured": is_email_configured(),
    }


@app.get("/alerts/settings/{account_id}")
async def get_account_alert_settings(
    account_id: str,
    user=Depends(get_current_user), conn=Depends(get_conn)
):
    """Get alert settings for the current user's account."""
    settings = await get_alert_settings(conn, str(user["id"]), account_id)
    return {
        "settings":         settings,
        "email_configured": is_email_configured(),
    }


@app.post("/alerts/settings")
async def save_alert_settings(
    req: AlertSettingsRequest,
    user=Depends(require_role("analyst")), conn=Depends(get_conn)
):
    """Create or update alert settings for an account."""
    if not (0 <= req.score_threshold <= 100):
        raise HTTPException(status_code=422, detail="score_threshold must be 0–100.")
    account = await get_account(conn, req.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    # Enforce field permissions: only admin+ can set medium/new_finding alerts
    role = user.get("role", "analyst")
    can_advanced = role in ("admin", "superadmin")
    settings = await upsert_alert_settings(
        conn,
        user_id=str(user["id"]),
        account_id=req.account_id,
        email=req.email,
        score_threshold=req.score_threshold,
        alert_on_critical=req.alert_on_critical,
        alert_on_high=req.alert_on_high,
        alert_on_medium=req.alert_on_medium if can_advanced else False,
        alert_on_new_finding=req.alert_on_new_finding if can_advanced else False,
        enabled=req.enabled,
    )
    return {"settings": settings}


@app.get("/alerts/history")
async def get_alert_history(
    user=Depends(get_current_user), conn=Depends(get_conn)
):
    """Get alert history for the current user."""
    history = await get_alert_history_for_user(conn, str(user["id"]))
    return {"history": history}


@app.post("/alerts/test/{account_id}")
async def send_test_alert(
    account_id: str,
    user=Depends(require_role("admin")), conn=Depends(get_conn)
):
    """Send a test alert email for an account."""
    from notifications.email_engine import build_alert_email, send_alert_email

    if not is_email_configured():
        raise HTTPException(status_code=400,
            detail="Email not configured. Add SMTP settings to .env")

    settings = await get_alert_settings(conn, str(user["id"]), account_id)
    if not settings:
        raise HTTPException(status_code=404,
            detail="No alert settings found for this account.")

    account = await get_account(conn, account_id, str(user["id"]))
    subject, html = build_alert_email(
        account_name=account["name"],
        cloud=account["cloud"],
        score=72,
        threshold=settings["score_threshold"],
        findings=[{
            "severity":      "HIGH",
            "rule_id":       "TEST-001",
            "resource_name": "test-resource",
            "message":       "This is a test alert from CSPM.",
        }],
    )
    sent = send_alert_email(settings["email"], f"[TEST] {subject}", html)
    if not sent:
        raise HTTPException(status_code=500, detail="Failed to send test email.")
    return {"status": "sent", "to": settings["email"]}


@app.get("/system-alerts/settings")
async def get_system_alerts(user=Depends(require_role("superadmin")), conn=Depends(get_conn)):
    """Get system-wide alert settings. Superadmin only."""
    settings = await get_system_alert_settings(conn)
    return {"settings": settings, "email_configured": is_email_configured()}


@app.post("/system-alerts/settings")
async def save_system_alerts(
    req: SystemAlertSettingsRequest,
    user=Depends(require_role("superadmin")), conn=Depends(get_conn)
):
    """Configure system-wide alert threshold. Superadmin only."""
    if not (0 <= req.score_threshold <= 100):
        raise HTTPException(status_code=422, detail="score_threshold must be 0–100.")
    settings = await upsert_system_alert_settings(
        conn, email=req.email, score_threshold=req.score_threshold,
        enabled=req.enabled, updated_by=str(user["id"])
    )
    return {"settings": settings}


# ── Admin ─────────────────────────────────────────────────────────────────────

@app.get("/admin/users")
async def admin_list_users(user=Depends(require_role("superadmin")), conn=Depends(get_conn)):
    return {"users": await get_all_users(conn)}


@app.post("/admin/invite", status_code=201)
async def admin_invite_user(
    req: AdminInviteRequest,
    user=Depends(require_role("superadmin")),
    conn=Depends(get_conn),
):
    """
    Invite a new user by email. Sends a 72-hour invite link.
    The invited user sets their own name, username, and password.
    """
    from auth.dependencies import ROLE_LEVEL
    from notifications.email_engine import send_invite_email, is_email_configured

    if req.role not in ROLE_LEVEL:
        raise HTTPException(status_code=422,
            detail=f"Invalid role. Must be one of: {list(ROLE_LEVEL.keys())}")
    if await get_user_by_email(conn, req.email):
        raise HTTPException(status_code=409, detail="Email already registered.")

    token      = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=72)
    await create_invite_token(conn, req.email, req.role, token, expires_at, str(user["id"]))

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    invite_url   = f"{frontend_url}?invite_token={token}"

    email_sent = False
    if is_email_configured():
        email_sent = send_invite_email(req.email, req.role, invite_url)

    return {
        "email":      req.email,
        "role":       req.role,
        "invite_url": None if email_sent else invite_url,
        "email_sent": email_sent,
    }


@app.get("/invite/{token}")
async def validate_invite(token: str, conn=Depends(get_conn)):
    """Public endpoint — returns email + role if token is valid and unused."""
    row = await get_invite_token(conn, token)
    if not row:
        raise HTTPException(status_code=404, detail="Invite token not found or already used.")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite token has expired.")
    return {"email": row["email"], "role": row["role"]}


@app.post("/auth/accept-invite", status_code=201)
async def accept_invite(req: AcceptInviteRequest, conn=Depends(get_conn)):
    """
    Complete an invitation: creates the user account and returns a JWT.
    """
    row = await get_invite_token(conn, req.token)
    if not row:
        raise HTTPException(status_code=404, detail="Invite token not found or already used.")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite token has expired.")

    if not req.username or len(req.username.strip()) < 3:
        raise HTTPException(status_code=422, detail="Username must be at least 3 characters.")
    if not req.name or len(req.name.strip()) < 1:
        raise HTTPException(status_code=422, detail="Name is required.")
    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    if await get_user_by_username(conn, req.username):
        raise HTTPException(status_code=409, detail="Username already taken.")
    if await get_user_by_email(conn, row["email"]):
        raise HTTPException(status_code=409, detail="Email already registered.")

    pw_hash  = hash_password(req.password)
    new_user = await create_user(conn, row["email"], pw_hash, req.name.strip(),
                                  username=req.username.strip())
    new_user = await update_user_role(conn, str(new_user["id"]), row["role"])
    await mark_invite_used(conn, req.token)

    token_jwt = create_token({"sub": str(new_user["id"])})
    return _user_response(new_user, token_jwt)


@app.patch("/admin/users/{target_user_id}")
async def patch_user(
    target_user_id: str,
    req: PatchUserRequest,
    user=Depends(require_role("superadmin")),
    conn=Depends(get_conn),
):
    """Update is_active and/or valid_until for a user."""
    if target_user_id == str(user["id"]):
        raise HTTPException(status_code=400, detail="You cannot modify your own account status.")

    target = await get_user_by_id(conn, target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    is_active = req.is_active if req.is_active is not None else target["is_active"]

    valid_until = target.get("valid_until")
    if req.valid_until is not None:
        if req.valid_until == "":
            valid_until = None
        else:
            try:
                valid_until = datetime.fromisoformat(req.valid_until).replace(tzinfo=timezone.utc)
            except ValueError:
                raise HTTPException(status_code=422, detail="Invalid valid_until date format.")

    updated = await update_user_meta(conn, target_user_id, is_active, valid_until)
    return {
        "id":          str(updated["id"]),
        "is_active":   updated["is_active"],
        "valid_until": updated["valid_until"].isoformat() if updated.get("valid_until") else None,
    }


@app.delete("/admin/users/{target_user_id}", status_code=200)
async def admin_delete_user(
    target_user_id: str,
    request: Request,
    user=Depends(require_role("superadmin")),
    conn=Depends(get_conn),
):
    """Permanently delete a user and all their data. Superadmin only."""
    if target_user_id == str(user["id"]):
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    target = await get_user_by_id(conn, target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    await delete_user(conn, target_user_id)
    try:
        await log_action(conn, str(user["id"]), user["email"], "delete_user",
                         resource_type="user", resource_id=target_user_id,
                         resource_name=target.get("email"),
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {"status": "deleted", "user_id": target_user_id}


@app.get("/admin/stats")
async def admin_stats(user=Depends(require_role("admin")), conn=Depends(get_conn)):
    return await get_platform_stats(conn)


@app.get("/admin/email-test")
async def email_test_connection(user=Depends(require_role("admin"))):
    """Test SMTP connectivity and auth — returns detailed status for diagnostics."""
    from notifications.email_engine import test_smtp_connection
    return test_smtp_connection()


class EmailSendTestRequest(BaseModel):
    to_email: str

@app.post("/admin/email-test")
async def email_send_test(req: EmailSendTestRequest, user=Depends(require_role("admin"))):
    """Send a test email to confirm end-to-end delivery."""
    from notifications.email_engine import send_alert_email, is_email_configured
    if not is_email_configured():
        raise HTTPException(status_code=400,
            detail="SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASSWORD to your .env file.")
    html = """
    <div style="font-family:sans-serif;background:#111214;color:#e8e8e8;padding:32px">
      <h2 style="color:#ffe600">VANGUARD CSPM — Email Test</h2>
      <p>This is a test email confirming your SMTP configuration is working correctly.</p>
      <p style="color:#606068;font-size:12px">Sent from CSPM admin email diagnostics.</p>
    </div>"""
    sent = send_alert_email(req.to_email, "[VANGUARD] SMTP Test — Email Delivery Confirmed", html)
    if not sent:
        raise HTTPException(status_code=500,
            detail="Email was not delivered. Check backend logs for details. "
                   "Common causes: unverified sender email in Brevo/provider dashboard, "
                   "incorrect SMTP credentials, or firewall blocking port 587.")
    return {"status": "sent", "to": req.to_email}


@app.put("/admin/users/{target_user_id}/role")
async def assign_user_role(
    target_user_id: str,
    req: UpdateRoleRequest,
    request: Request,
    user=Depends(require_role("superadmin")),
    conn=Depends(get_conn),
):
    """Assign a role to a user. Only superadmins can do this."""
    from auth.dependencies import ROLE_LEVEL
    valid_roles = list(ROLE_LEVEL.keys())
    if req.role not in valid_roles:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid role. Must be one of: {valid_roles}",
        )
    # Prevent superadmin from demoting themselves
    if target_user_id == str(user["id"]) and req.role != "superadmin":
        raise HTTPException(
            status_code=400, detail="You cannot change your own role."
        )
    updated = await update_user_role(conn, target_user_id, req.role)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found.")
    try:
        await log_action(conn, str(user["id"]), user["email"], "change_user_role",
                         resource_type="user", resource_id=target_user_id,
                         detail={"new_role": req.role},
                         ip_address=request.client.host if request.client else None)
    except Exception:
        pass
    return {
        "user_id": target_user_id,
        "role":    req.role,
        "message": f"Role updated to '{req.role}'.",
    }

# ── Audit Log ──────────────────────────────────────────────────────────────────

@app.get("/audit-log")
async def get_audit_log_endpoint(
    limit: int = 100,
    user=Depends(require_role("admin")),
    conn=Depends(get_conn),
):
    """
    Returns audit log entries.
    Admin and superadmin both see all users' actions.
    Analysts/viewers are forbidden (require_role("admin") enforces this).
    """
    logs = await get_audit_log(conn, str(user["id"]), is_superadmin=True, limit=limit)
    # Serialize UUIDs and datetimes
    for entry in logs:
        for k, v in entry.items():
            if hasattr(v, "isoformat"):
                entry[k] = v.isoformat()
            elif hasattr(v, "__str__") and not isinstance(v, (str, int, float, bool, type(None))):
                entry[k] = str(v)
    return {"logs": logs}
