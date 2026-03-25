"""
Database Models
All database query functions in one place.
No ORM — plain asyncpg queries for clarity and performance.
"""

import json
from datetime import datetime, timezone
from typing import Optional
import asyncpg


# ── Users ─────────────────────────────────────────────────────────────────────

async def create_user(conn, email: str, password_hash: str, name: str, username: str = None) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO users (email, password_hash, name, username)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, name, username, is_admin, role, is_active, valid_until, created_at
        """,
        email.lower().strip(), password_hash, name,
        username.lower().strip() if username else None
    )
    return dict(row)


async def get_user_by_email(conn, email: str) -> Optional[dict]:
    row = await conn.fetchrow(
        "SELECT * FROM users WHERE email = $1",
        email.lower().strip()
    )
    return dict(row) if row else None


async def get_user_by_username(conn, username: str) -> Optional[dict]:
    row = await conn.fetchrow(
        "SELECT * FROM users WHERE username = $1",
        username.lower().strip()
    )
    return dict(row) if row else None


async def get_user_by_id(conn, user_id: str) -> Optional[dict]:
    row = await conn.fetchrow(
        """
        SELECT id, email, name, username, is_admin, role, is_active, valid_until, created_at
        FROM users WHERE id = $1
        """,
        user_id
    )
    return dict(row) if row else None


async def get_user_count(conn) -> int:
    row = await conn.fetchrow("SELECT COUNT(*) AS cnt FROM users")
    return row["cnt"]


async def get_all_users(conn) -> list:
    rows = await conn.fetch(
        """
        SELECT u.id, u.email, u.name, u.username, u.is_admin, u.role,
               u.is_active, u.valid_until, u.created_at,
               COUNT(DISTINCT ca.id) AS account_count,
               COUNT(DISTINCT sr.id) AS scan_count
        FROM users u
        LEFT JOIN cloud_accounts ca ON ca.user_id = u.id
        LEFT JOIN scan_results sr   ON sr.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        """
    )
    return [dict(r) for r in rows]


async def update_user_role(conn, user_id: str, role: str) -> Optional[dict]:
    row = await conn.fetchrow(
        """
        UPDATE users SET role = $1, is_admin = ($1 IN ('admin', 'superadmin'))
        WHERE id = $2
        RETURNING id, email, name, is_admin, role, is_active, valid_until, created_at
        """,
        role, user_id
    )
    return dict(row) if row else None


async def update_user_meta(conn, user_id: str, is_active: bool,
                            valid_until=None) -> Optional[dict]:
    """Update is_active and/or valid_until for a user."""
    row = await conn.fetchrow(
        """
        UPDATE users SET is_active = $1, valid_until = $2
        WHERE id = $3
        RETURNING id, email, name, is_admin, role, is_active, valid_until, created_at
        """,
        is_active, valid_until, user_id
    )
    return dict(row) if row else None


async def delete_user(conn, user_id: str) -> bool:
    result = await conn.execute("DELETE FROM users WHERE id = $1", user_id)
    return result == "DELETE 1"


async def update_user_password(conn, user_id: str, password_hash: str) -> None:
    await conn.execute(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        password_hash, user_id
    )


# ── Invite Tokens ──────────────────────────────────────────────────────────────

async def create_invite_token(conn, email: str, role: str, token: str, expires_at, created_by: str) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO invite_tokens (email, role, token, expires_at, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, role, token, expires_at, used, created_at
        """,
        email.lower().strip(), role, token, expires_at, created_by
    )
    return dict(row)


async def get_invite_token(conn, token: str) -> Optional[dict]:
    row = await conn.fetchrow(
        "SELECT * FROM invite_tokens WHERE token = $1",
        token
    )
    return dict(row) if row else None


async def mark_invite_used(conn, token: str) -> None:
    await conn.execute(
        "UPDATE invite_tokens SET used = true WHERE token = $1",
        token
    )


# ── Password Reset Tokens ──────────────────────────────────────────────────────

async def create_reset_token(conn, user_id: str, token: str, expires_at) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO password_reset_tokens (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, token, expires_at, used, created_at
        """,
        user_id, token, expires_at
    )
    return dict(row)


async def get_reset_token(conn, token: str) -> Optional[dict]:
    row = await conn.fetchrow(
        "SELECT * FROM password_reset_tokens WHERE token = $1",
        token
    )
    return dict(row) if row else None


async def mark_reset_token_used(conn, token_id: str) -> None:
    await conn.execute(
        "UPDATE password_reset_tokens SET used = true WHERE id = $1",
        token_id
    )


# ── Cloud Accounts ────────────────────────────────────────────────────────────

async def create_account(conn, user_id: str, name: str, cloud: str,
                         encrypted_creds: str, region: Optional[str],
                         scan_interval_hours: int,
                         category: str = "General") -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO cloud_accounts
            (user_id, name, cloud, encrypted_creds, region, scan_interval_hours, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, user_id, name, cloud, region, scan_interval_hours,
                  last_scanned_at, created_at, category
        """,
        user_id, name, cloud, encrypted_creds, region, scan_interval_hours, category
    )
    return dict(row)


async def get_accounts_for_user(conn, user_id: str) -> list:
    """Returns all cloud accounts in the system (shared across all team members)."""
    rows = await conn.fetch(
        """
        SELECT id, user_id, name, cloud, region, scan_interval_hours,
               last_scanned_at, created_at, category
        FROM cloud_accounts
        ORDER BY category ASC, created_at ASC
        """
    )
    return [dict(r) for r in rows]


async def get_account(conn, account_id: str, user_id: str = None) -> Optional[dict]:
    """Get a single account. user_id is no longer enforced for reads."""
    row = await conn.fetchrow(
        "SELECT * FROM cloud_accounts WHERE id = $1",
        account_id
    )
    return dict(row) if row else None


async def get_account_with_creds(conn, account_id: str) -> Optional[dict]:
    """Get account including encrypted_creds."""
    row = await conn.fetchrow(
        "SELECT * FROM cloud_accounts WHERE id = $1",
        account_id
    )
    return dict(row) if row else None


async def update_account(conn, account_id: str, user_id: str,
                         name: str, scan_interval_hours: int,
                         category: str = "General") -> Optional[dict]:
    """Any admin can update any account (no ownership check)."""
    row = await conn.fetchrow(
        """
        UPDATE cloud_accounts
        SET name = $1, scan_interval_hours = $2, category = $3
        WHERE id = $4
        RETURNING id, name, cloud, region, scan_interval_hours, last_scanned_at, category
        """,
        name, scan_interval_hours, category, account_id
    )
    return dict(row) if row else None


async def delete_account(conn, account_id: str, user_id: str = None) -> bool:
    """Any admin can delete any account (no ownership check)."""
    result = await conn.execute(
        "DELETE FROM cloud_accounts WHERE id = $1",
        account_id
    )
    return result.split()[-1] != "0"


async def update_account_last_scanned(conn, account_id: str) -> None:
    await conn.execute(
        "UPDATE cloud_accounts SET last_scanned_at = now() WHERE id = $1",
        account_id
    )


# ── Scan Results ──────────────────────────────────────────────────────────────

async def save_scan_result(conn, user_id: str, account_id: Optional[str],
                           cloud: str, scores: dict, resources_scanned: int,
                           finding_counts: dict, findings: list,
                           triggered_by: str = "manual") -> dict:
    # Cap findings at 50,000 to prevent runaway DB storage (enterprise accounts
    # can have thousands of resources; beyond 50k findings the report is unusable anyway)
    MAX_FINDINGS = 50_000
    if len(findings) > MAX_FINDINGS:
        import logging
        logging.getLogger(__name__).warning(
            f"save_scan_result: truncating {len(findings)} findings to {MAX_FINDINGS}"
        )
        findings = findings[:MAX_FINDINGS]

    # Validate score values are in range
    scores = {
        k: max(0, min(100, int(v))) if isinstance(v, (int, float)) else v
        for k, v in (scores or {}).items()
    }

    row = await conn.fetchrow(
        """
        INSERT INTO scan_results
            (user_id, account_id, cloud, scores, resources_scanned,
             finding_counts, findings, triggered_by)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8)
        RETURNING id, user_id, account_id, cloud, scores, resources_scanned,
                  finding_counts, triggered_by, created_at
        """,
        user_id,
        account_id,
        cloud,
        json.dumps(scores),
        resources_scanned,
        json.dumps(finding_counts),
        json.dumps(findings),
        triggered_by,
    )
    return dict(row)


async def get_scans_for_user(conn, user_id: str,
                              account_id: Optional[str] = None,
                              limit: int = 20,
                              since=None) -> list:
    """Returns all scans system-wide (shared across team members). user_id unused but kept for API compat."""
    if account_id:
        if since:
            rows = await conn.fetch(
                """
                SELECT id, user_id, account_id, cloud, scores, resources_scanned,
                       finding_counts, triggered_by, created_at
                FROM scan_results
                WHERE account_id = $1 AND created_at >= $2
                ORDER BY created_at DESC
                LIMIT $3
                """,
                account_id, since, limit
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, user_id, account_id, cloud, scores, resources_scanned,
                       finding_counts, triggered_by, created_at
                FROM scan_results
                WHERE account_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                account_id, limit
            )
    else:
        if since:
            rows = await conn.fetch(
                """
                SELECT sr.id, sr.user_id, sr.account_id, sr.cloud, sr.scores,
                       sr.resources_scanned, sr.finding_counts, sr.triggered_by,
                       sr.created_at, ca.name AS account_name
                FROM scan_results sr
                LEFT JOIN cloud_accounts ca ON ca.id = sr.account_id
                WHERE sr.created_at >= $1
                ORDER BY sr.created_at DESC
                LIMIT $2
                """,
                since, limit
            )
        else:
            rows = await conn.fetch(
                """
                SELECT sr.id, sr.user_id, sr.account_id, sr.cloud, sr.scores,
                       sr.resources_scanned, sr.finding_counts, sr.triggered_by,
                       sr.created_at, ca.name AS account_name
                FROM scan_results sr
                LEFT JOIN cloud_accounts ca ON ca.id = sr.account_id
                ORDER BY sr.created_at DESC
                LIMIT $1
                """,
                limit
            )
    return [_deserialise_scan(dict(r)) for r in rows]


async def get_scan_by_id(conn, scan_id: str, user_id: str = None) -> Optional[dict]:
    """Get a scan by ID — no user_id ownership check (all team members share scan history)."""
    row = await conn.fetchrow(
        """
        SELECT sr.*, ca.name AS account_name
        FROM scan_results sr
        LEFT JOIN cloud_accounts ca ON ca.id = sr.account_id
        WHERE sr.id = $1
        """,
        scan_id,
    )
    if not row:
        return None
    result = dict(row)
    result["findings"] = json.loads(result["findings"]) if isinstance(result["findings"], str) else result["findings"]
    return _deserialise_scan(result)


def _deserialise_scan(row: dict) -> dict:
    """asyncpg returns JSONB as strings in some versions — parse if needed."""
    for field in ("scores", "finding_counts"):
        if isinstance(row.get(field), str):
            row[field] = json.loads(row[field])
    if "created_at" in row and isinstance(row["created_at"], datetime):
        row["created_at"] = row["created_at"].isoformat()
    return row


# ── Finding Statuses ──────────────────────────────────────────────────────────

async def upsert_finding_status(conn, user_id: str,
                                finding_key: str, status: str) -> None:
    await conn.execute(
        """
        INSERT INTO finding_statuses (user_id, finding_key, status, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (user_id, finding_key)
        DO UPDATE SET status = $3, updated_at = now()
        """,
        user_id, finding_key, status
    )


async def get_finding_statuses_for_user(conn, user_id: str) -> dict:
    rows = await conn.fetch(
        "SELECT finding_key, status FROM finding_statuses WHERE user_id = $1",
        user_id
    )
    return {r["finding_key"]: r["status"] for r in rows}


# ── Scheduled Jobs ────────────────────────────────────────────────────────────

async def upsert_scheduled_job(conn, account_id: str,
                                next_run_at: datetime) -> None:
    await conn.execute(
        """
        INSERT INTO scheduled_jobs (account_id, next_run_at)
        VALUES ($1, $2)
        ON CONFLICT (account_id)
        DO UPDATE SET next_run_at = $2, is_running = false, last_error = null
        """,
        account_id, next_run_at
    )


async def get_due_jobs(conn) -> list:
    """Return accounts whose next_run_at has passed and are not currently running."""
    rows = await conn.fetch(
        """
        SELECT sj.account_id, ca.user_id, ca.cloud, ca.encrypted_creds,
               ca.region, ca.scan_interval_hours, ca.name
        FROM scheduled_jobs sj
        JOIN cloud_accounts ca ON ca.id = sj.account_id
        WHERE sj.next_run_at <= now()
          AND sj.is_running = false
          AND ca.scan_interval_hours > 0
        """
    )
    return [dict(r) for r in rows]


async def set_job_running(conn, account_id: str, running: bool,
                           error: Optional[str] = None) -> None:
    await conn.execute(
        """
        UPDATE scheduled_jobs
        SET is_running = $1, last_error = $2
        WHERE account_id = $3
        """,
        running, error, account_id
    )


# ── Admin Stats ───────────────────────────────────────────────────────────────

# ── Alert Settings ────────────────────────────────────────────────────────────

async def upsert_alert_settings(conn, user_id: str, account_id: str,
                                 email: str, score_threshold: int,
                                 alert_on_critical: bool, alert_on_high: bool,
                                 enabled: bool,
                                 alert_on_medium: bool = False,
                                 alert_on_new_finding: bool = False) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO alert_settings
            (user_id, account_id, email, score_threshold,
             alert_on_critical, alert_on_high, alert_on_medium,
             alert_on_new_finding, enabled)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id, account_id)
        DO UPDATE SET email=$3, score_threshold=$4,
                      alert_on_critical=$5, alert_on_high=$6,
                      alert_on_medium=$7, alert_on_new_finding=$8,
                      enabled=$9
        RETURNING *
        """,
        user_id, account_id, email, score_threshold,
        alert_on_critical, alert_on_high, alert_on_medium,
        alert_on_new_finding, enabled
    )
    return dict(row)


async def get_alert_settings(conn, user_id: str, account_id: str) -> Optional[dict]:
    """Per-user per-account alert settings."""
    row = await conn.fetchrow(
        "SELECT * FROM alert_settings WHERE user_id=$1 AND account_id=$2",
        user_id, account_id
    )
    return dict(row) if row else None


async def get_alert_settings_for_account(conn, account_id: str) -> Optional[dict]:
    """Used by scheduler — returns first enabled row (legacy single-fire path)."""
    row = await conn.fetchrow(
        "SELECT * FROM alert_settings WHERE account_id=$1 AND enabled=true LIMIT 1",
        account_id
    )
    return dict(row) if row else None


async def get_all_alert_settings_for_account(conn, account_id: str) -> list:
    """Returns all enabled alert configs for an account (one per user who configured it)."""
    rows = await conn.fetch(
        "SELECT * FROM alert_settings WHERE account_id=$1 AND enabled=true",
        account_id
    )
    return [dict(r) for r in rows]


async def get_all_alert_settings_for_user(conn, user_id: str) -> list:
    """Returns this user's alert settings for all accounts."""
    rows = await conn.fetch(
        """
        SELECT als.*, ca.name as account_name, ca.cloud
        FROM alert_settings als
        JOIN cloud_accounts ca ON ca.id = als.account_id
        WHERE als.user_id = $1
        ORDER BY als.created_at DESC
        """,
        user_id
    )
    return [dict(r) for r in rows]


async def get_system_alert_settings(conn) -> Optional[dict]:
    """Returns the single system-wide alert config (superadmin sets this)."""
    row = await conn.fetchrow("SELECT * FROM system_alert_settings LIMIT 1")
    return dict(row) if row else None


async def upsert_system_alert_settings(conn, email: str, score_threshold: int,
                                        enabled: bool, updated_by: str) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO system_alert_settings (email, score_threshold, enabled, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (id) DO NOTHING
        RETURNING *
        """,
        email, score_threshold, enabled, updated_by
    )
    if row:
        return dict(row)
    # Update existing row
    row = await conn.fetchrow(
        """
        UPDATE system_alert_settings
        SET email=$1, score_threshold=$2, enabled=$3, updated_by=$4, updated_at=NOW()
        RETURNING *
        """,
        email, score_threshold, enabled, updated_by
    )
    return dict(row)


async def save_alert_history(conn, user_id: str, account_id: str,
                              account_name: str, score: int,
                              trigger: str, email_sent: bool) -> None:
    await conn.execute(
        """
        INSERT INTO alert_history
            (user_id, account_id, account_name, score, trigger, email_sent)
        VALUES ($1,$2,$3,$4,$5,$6)
        """,
        user_id, account_id, account_name, score, trigger, email_sent
    )


async def get_alert_history_for_user(conn, user_id: str, limit: int = 20) -> list:
    rows = await conn.fetch(
        """
        SELECT * FROM alert_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        user_id, limit
    )
    return [dict(r) for r in rows]


# ── Platform Stats ────────────────────────────────────────────────────────────

async def get_platform_stats(conn) -> dict:
    row = await conn.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM users)         AS total_users,
            (SELECT COUNT(*) FROM cloud_accounts) AS total_accounts,
            (SELECT COUNT(*) FROM scan_results)   AS total_scans,
            (SELECT COUNT(*) FROM scan_results
             WHERE created_at > now() - interval '24 hours') AS scans_last_24h
        """
    )
    return dict(row)


# ── Audit Log ─────────────────────────────────────────────────────────────────

async def log_action(
    conn,
    user_id: str,
    user_email: str,
    action: str,
    resource_type: str = None,
    resource_id: str = None,
    resource_name: str = None,
    detail: dict = None,
    ip_address: str = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO audit_log
            (user_id, user_email, action, resource_type, resource_id,
             resource_name, detail, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        user_id, user_email, action, resource_type, resource_id,
        resource_name, json.dumps(detail or {}), ip_address,
    )


async def get_audit_log(conn, user_id: str, is_superadmin: bool = False, limit: int = 100) -> list:
    if is_superadmin:
        rows = await conn.fetch(
            "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1",
            limit,
        )
    else:
        rows = await conn.fetch(
            "SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
            user_id, limit,
        )
    return [dict(r) for r in rows]
