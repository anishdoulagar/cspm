<div align="center">

```
██╗   ██╗ █████╗ ███╗   ██╗ ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗
██║   ██║██╔══██╗████╗  ██║██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗
██║   ██║███████║██╔██╗ ██║██║  ███╗██║   ██║███████║██████╔╝██║  ██║
╚██╗ ██╔╝██╔══██║██║╚██╗██║██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║
 ╚████╔╝ ██║  ██║██║ ╚████║╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝
  ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
```

### Cloud Security Posture Management

**Scan · Score · Alert · Remediate**

[![AWS](https://img.shields.io/badge/AWS-Supported-FF9900?style=flat-square&logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![Azure](https://img.shields.io/badge/Azure-Supported-0089D6?style=flat-square&logo=microsoftazure&logoColor=white)](https://azure.microsoft.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)

</div>

---

## What is Vanguard?

Vanguard continuously scans your AWS and Azure environments for security misconfigurations, scores your posture on a 0–100 scale, and fires alerts the moment something falls below your threshold — before attackers find it first.

```
  Your Cloud Accounts          Vanguard Engine            You
  ─────────────────    →    ──────────────────    →    ──────
  AWS · Azure               Scan → Score → Alert       Dashboard
  Hundreds of resources     345+ built-in rules        Real-time findings
  Any region                Custom rules support       Email alerts
```

---

## ⚡ Quick Start

> **Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) · Python 3

```bash
git clone https://github.com/anishdoulagar/cspm.git
cd cspm
./setup.sh
```

**That's it.** Dashboard is live at `http://localhost:5173`

> The first account you register is automatically promoted to **superadmin**.

> **Windows users:** run `python3 generate_keys.py` then `docker compose up --build -d` instead of `./setup.sh`

---

## Features

| | Feature | Description |
|---|---|---|
| 🔍 | **Multi-Cloud Scanning** | AWS and Azure with 500+ built-in security rules |
| 📊 | **Security Scoring** | Per-service and overall posture score (0–100) |
| 📈 | **Scan History** | Track posture over time, compare changes between scans |
| 📤 | **Export Reports** | Download findings as CSV or JSON per scan |
| ⚙️ | **Custom Rules** | Write your own compliance checks |
| ⏱️ | **Scheduled Scanning** | Automatic background scans — set it and forget it |
| 🔔 | **Smart Alerting** | System-wide alerts (superadmin) + per-user per-account alerts |
| 🔐 | **Role-Based Access** | Four roles with fine-grained permissions |
| 📋 | **Audit Log** | Every action logged with user, timestamp, and IP |

---

## Roles

```
SUPERADMIN  ──────────────────────────────────────────────────────  Full access
   │         User management · System alerts · All accounts · All data
   │
ADMIN  ────────────────────────────────────────────────────────────  Team lead
   │         All scans · All accounts · Configure per-account alerts
   │
ANALYST  ──────────────────────────────────────────────────────────  Operator
   │         Run scans · Manage accounts · Configure own alerts
   │
VIEWER  ───────────────────────────────────────────────────────────  Read-only
             View results · See alert status · No edits
```

---

## Configuration

### Cloud Credentials

Add credentials in the dashboard under **Accounts → Add Account**:

| Cloud | What you need |
|-------|--------------|
| **AWS** | Access Key ID + Secret Access Key |
| **Azure** | Tenant ID + Client ID + Client Secret (Service Principal) |

### Email Alerts _(optional)_

Edit `.env` with your SMTP provider. [Brevo](https://www.brevo.com) is recommended — free, 300 emails/day, no credit card:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASSWORD=your-brevo-smtp-key
SMTP_FROM=you@example.com
```

---

## Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│  Frontend      React 18 · Vite · Recharts               │
│  Backend       FastAPI · Python · asyncio               │
│  Database      PostgreSQL 16                            │
│  Auth          JWT (HS256) · bcrypt · Role middleware   │
│  Infra         Docker · Docker Compose · Nginx (prod)  │
│  Cloud SDKs    boto3 (AWS) · azure-sdk (Azure)         │
└─────────────────────────────────────────────────────────┘
```

---

## Commands

```bash
# First time setup
./setup.sh

# Start
docker compose up -d

# Stop
docker compose down

# View live logs
docker logs cspm_backend -f

# Rebuild after code changes
docker compose up --build -d

# ⚠️  Full reset (deletes all scan data)
docker compose down -v
```

---

## Project Structure

```
cspm/
├── CSPM-Tool/                  # Backend
│   ├── api/server.py           # All REST endpoints
│   ├── auth/                   # JWT · bcrypt · role guards
│   ├── connectors/             # AWS + Azure SDK collectors
│   ├── database/               # Schema · models · migrations
│   ├── policies/               # 345+ built-in rules + custom rules
│   ├── scheduler/              # Background scan engine
│   └── scoring/                # Posture score algorithm
│
├── CSPM-Dashboard/             # Frontend
│   └── src/pages/              # Dashboard · History · Alerts · Policies · Admin
│
├── docker-compose.yml          # Orchestration
├── .env.example                # Environment template
├── generate_keys.py            # Secret key generator
└── setup.sh                    # One-command setup
```

---

<div align="center">

Built for teams who take cloud security seriously.

</div>
