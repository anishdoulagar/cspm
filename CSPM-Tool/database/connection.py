"""
Database Connection — asyncpg pool with retry logic.
"""

import asyncpg
import asyncio
import os
import socket
import logging

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialised.")
    return _pool


async def get_conn():
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def init_db() -> None:
    global _pool

    url = os.environ.get("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL not set.")

    # Extract host for DNS debug logging
    try:
        host = url.split("@")[1].split(":")[0]
        logger.info(f"DATABASE_URL host: '{host}'")
        # Try resolving it first so we get a clear error
        resolved = socket.getaddrinfo(host, 5432)
        logger.info(f"DNS resolved '{host}' → {resolved[0][4][0]}")
    except Exception as e:
        logger.warning(f"DNS pre-check failed for '{host}': {e}")

    logger.info(f"Connecting to PostgreSQL...")

    for attempt in range(1, 16):
        try:
            _pool = await asyncpg.create_pool(
                dsn=url,
                min_size=2,
                max_size=10,
                command_timeout=30,
            )
            logger.info("✓ PostgreSQL connection pool created.")
            break
        except Exception as e:
            if attempt == 15:
                raise RuntimeError(f"Could not connect after 15 attempts: {e}")
            wait = min(attempt * 2, 20)
            logger.warning(f"Attempt {attempt}/15 failed: {e}. Retry in {wait}s...")
            await asyncio.sleep(wait)

    await run_migrations()


async def close_db() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def run_migrations() -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
    logger.info("✓ Database migrations complete.")


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        UNIQUE NOT NULL,
    password_hash TEXT        NOT NULL,
    name          TEXT        NOT NULL DEFAULT '',
    is_admin      BOOLEAN     NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- RBAC: add role column to existing users table (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role       TEXT        NOT NULL DEFAULT 'analyst';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
-- Promote existing admins to superadmin on first migration
UPDATE users SET role = 'superadmin' WHERE is_admin = true AND role = 'analyst';

-- Username-based login (nullable to allow existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Invitation tokens (superadmin invites users by email)
CREATE TABLE IF NOT EXISTS invite_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'analyst',
    token      TEXT        UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL DEFAULT false,
    created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);

CREATE TABLE IF NOT EXISTS cloud_accounts (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 TEXT        NOT NULL,
    cloud                TEXT        NOT NULL CHECK (cloud IN ('aws', 'azure')),
    encrypted_creds      TEXT        NOT NULL,
    region               TEXT,
    scan_interval_hours  INTEGER     NOT NULL DEFAULT 24,
    last_scanned_at      TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON cloud_accounts(user_id);

-- Account categories (idempotent)
ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';

CREATE TABLE IF NOT EXISTS scan_results (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id        UUID        REFERENCES cloud_accounts(id) ON DELETE SET NULL,
    cloud             TEXT        NOT NULL,
    scores            JSONB       NOT NULL DEFAULT '{}',
    resources_scanned INTEGER     NOT NULL DEFAULT 0,
    finding_counts    JSONB       NOT NULL DEFAULT '{}',
    findings          JSONB       NOT NULL DEFAULT '[]',
    triggered_by      TEXT        NOT NULL DEFAULT 'manual',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scans_user_id    ON scan_results(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_account_id ON scan_results(account_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scan_results(created_at DESC);
-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_scans_account_created ON scan_results(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_user_created    ON scan_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_cloud_created   ON scan_results(cloud, created_at DESC);

CREATE TABLE IF NOT EXISTS finding_statuses (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    finding_key TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'open',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, finding_key)
);
CREATE INDEX IF NOT EXISTS idx_finding_status_user ON finding_statuses(user_id);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
    account_id   UUID        PRIMARY KEY REFERENCES cloud_accounts(id) ON DELETE CASCADE,
    next_run_at  TIMESTAMPTZ NOT NULL,
    is_running   BOOLEAN     NOT NULL DEFAULT false,
    last_error   TEXT
);

-- ── Alert Settings ─────────────────────────────────────────────────────────
-- Per-account alert configuration
CREATE TABLE IF NOT EXISTS alert_settings (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id          UUID        NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
    email               TEXT        NOT NULL,
    score_threshold     INTEGER     NOT NULL DEFAULT 70,
    alert_on_critical   BOOLEAN     NOT NULL DEFAULT true,
    alert_on_high       BOOLEAN     NOT NULL DEFAULT false,
    enabled             BOOLEAN     NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_alert_settings_account ON alert_settings(account_id);

-- alert_settings is per-user per-account
DELETE FROM alert_settings WHERE user_id IS NULL;
DO $$ BEGIN ALTER TABLE alert_settings ALTER COLUMN user_id SET NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
ALTER TABLE alert_settings DROP CONSTRAINT IF EXISTS alert_settings_account_id_key;
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS alert_on_medium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS alert_on_new_finding BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_settings_user_id_account_id_key') THEN
        ALTER TABLE alert_settings ADD CONSTRAINT alert_settings_user_id_account_id_key UNIQUE (user_id, account_id);
    END IF;
END $$;

-- System-wide alert settings (superadmin configures platform-level threshold)
CREATE TABLE IF NOT EXISTS system_alert_settings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL,
    score_threshold INTEGER     NOT NULL DEFAULT 60,
    enabled         BOOLEAN     NOT NULL DEFAULT true,
    updated_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Alert History ──────────────────────────────────────────────────────────
-- Record of every alert email sent
CREATE TABLE IF NOT EXISTS alert_history (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id  UUID        REFERENCES cloud_accounts(id) ON DELETE SET NULL,
    account_name TEXT,
    score       INTEGER,
    trigger     TEXT,
    email_sent  BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id);

-- ── Audit Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
    user_email    TEXT,
    action        TEXT        NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    resource_name TEXT,
    detail        JSONB       NOT NULL DEFAULT '{}',
    ip_address    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
"""
