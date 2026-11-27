# HitechDairy Data Onboarding — Self-Hosted DevOps & Architecture Guide

This document provides the architecture, system requirements, runtime behavior, and step-by-step instructions for deploying and operating **HitechDairy DataEntry** on your own server.

---

## 1. Application Overview

**HitechDairy Data Onboarding** is a Node.js + TypeScript + Playwright automation platform with a built-in web dashboard. It ingests `.xlsx` workbooks, validates business rules, spawns parallel headless Chromium workers to submit records to the HitechDairy ERP web portal, and writes execution statuses/reports back to Excel and HTML/JSON logs.

### Core Components

| Component | Entry / Path | Responsibility |
| :--- | :--- | :--- |
| **Web UI & API Server** | `src/ui/server.ts`, `src/ui/runner.html` | Serves the Data Runner dashboard on `http://127.0.0.1:4173` (`UI_PORT`), handles `.xlsx` uploads (up to 25 MB), inspects sheet counts, streams live logs/progress via SSE (`/api/events`), and spawns `src/onboarding.ts`. |
| **Onboarding Controller** | `src/onboarding.ts`, `src/services/ApiAuthService.ts` | Runs pre-flight checks (file write lock, Farmers duplicate mobile validation), authenticates via ERP API (`POST /Login/UserLogin`) and reuses `storageState.json`, distributes pending rows round-robin across `1–4` workers, prunes old artifacts, and generates run + row-wise reports. |
| **Playwright Worker Engine** | `src/services/WorkerService.ts` | Runs isolated Chromium browser contexts per worker (blocking non-essential 3rd-party fonts/maps), executes retries, captures failure-only screenshots & API exchanges, and streams JSON progress events. |
| **Excel Batch & Reports** | `src/services/ExcelBatchService.ts`, `src/services/OnboardingReportBuilder.ts` | Creates pre-run `.xlsx` backups (`reports/backups/`), appends crash-recovery logs (`reports/recovery/*.jsonl`), flushes `Run_Status`, `WorkerId`, `ErpRecordId`, `ErrorMessage`, `ProcessedAt` back to Excel, and exports `reports/row_wise_report.xlsx`. |
| **AI Diagnostics (Optional)** | `src/services/groqIntelligenceService.ts` | Optional Groq LLM (`GROQ_API_KEY`) analyzes failed submissions and writes Markdown diagnostics to `reports/ai-intelligence/`. *(Legacy UI login with `tesseract.js` in `tests/auth.setup.ts` is kept intact but disconnected from `onboarding.ts`.)* |

### Supported Onboarding Modules
- `Products`
- `Variants` (runs V2 flow internally)
- `Customers`
- `Suppliers`
- `Farmers` (includes mandatory pre-validation blocking duplicate mobile numbers)
- `SalesInvoices`
- `AccountTransactions`

### Target ERP Environments
- **Demo:** `https://demo.hitechdairy.in`
- **UAT:** `https://webuat.hitechdairy.in`
- **Prod:** `https://hitechdairy.in`

---

## 2. Server & Runtime Requirements

| Resource | Minimum | Recommended (Parallel 2–4 Workers) |
| :--- | :--- | :--- |
| **OS** | Ubuntu 22.04 LTS / Windows Server | Ubuntu 22.04 or 24.04 LTS (64-bit) |
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 2–4 GB | 4–8 GB (single shared Chromium process + `1–4` capped contexts, non-essential assets blocked) |
| **Disk** | 5–10 GB free | 10+ GB free (auto-pruned: latest 10 backups, 14-day retention on logs/failure screenshots) |
| **Node.js** | v20.x LTS | v20.x or v22.x LTS |
| **Browser** | Playwright Chromium (`1.63.0`) | Installed via `npx playwright install --with-deps chromium` |

---

## 3. Network & Port Requirements

### Inbound
- **UI Server:** Listens on `127.0.0.1:4173` (configurable via `UI_PORT`).
- **Reverse Proxy (Recommended):** Expose `80`/`443` via Nginx or Caddy and proxy to `http://127.0.0.1:4173`.
  > **Important:** The Node server binds to `127.0.0.1` by design and has **no built-in user authentication**. Always place it behind a VPN, internal LAN firewall, or reverse-proxy authentication (Basic Auth / SSO).

### Outbound (HTTPS `443`)
The server must be able to reach:
- `demo.hitechdairy.in` / `webuat.hitechdairy.in` / `hitechdairy.in` (and their API subdomains)
- `api.groq.com` *(only if `USE_AI_INTELLIGENCE=true`)*

---

## 4. Environment Configuration (`.env`)

Copy `.env.example` to `.env` in the project root and configure as needed:

```dotenv
# Web UI Server
UI_PORT=4173
NO_OPEN=1

# Default Target Portal (overridable per run from the UI)
BASE_URL=https://webuat.hitechdairy.in
FINANCIAL_YEAR=2026-2027
USER_ROLE=Superadmin

# Optional CLI fallback credentials (UI prompts per run)
ADMIN_USERNAME=
ADMIN_PASSWORD=

# Playwright / API Auth & Session Reuse
HEADLESS=true
STORAGE_STATE_PATH=storageState.json
API_BASE_URL=
SESSION_MAX_AGE_HOURS=8
FORCE_LOGIN=false
DEFAULT_TIMEOUT=30000
NAVIGATION_TIMEOUT=45000
ACTION_TIMEOUT=15000

# Optional AI Diagnostics (Groq)
USE_AI_INTELLIGENCE=true
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
```

---

## 5. Step-by-Step Setup on Ubuntu Server

### 5.1 Install Node.js & Project Dependencies
```bash
# Clone repository
git clone <your-repo-url> /opt/hitechdairy-onboarding
cd /opt/hitechdairy-onboarding

# Install exact dependencies
npm ci

# Install Playwright Chromium & required OS shared libraries
npx playwright install --with-deps chromium

# Verify TypeScript compilation
npm run typecheck
```

### 5.2 Create `.env`
```bash
cp .env.example .env
# Edit .env and set NO_OPEN=1, HEADLESS=true, and optional GROQ_API_KEY
```

### 5.3 Run as a `systemd` Service
Create `/etc/systemd/system/hitechdairy-ui.service`:

```ini
[Unit]
Description=HitechDairy Data Onboarding UI Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/hitechdairy-onboarding
Environment=NODE_ENV=production
Environment=NO_OPEN=1
Environment=HEADLESS=true
ExecStart=/usr/bin/npx tsx src/ui/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable hitechdairy-ui
sudo systemctl start hitechdairy-ui
sudo systemctl status hitechdairy-ui
```

### 5.4 Nginx Reverse Proxy Configuration
Create `/etc/nginx/sites-available/hitechdairy-ui`:

```nginx
server {
    listen 80;
    server_name onboarding.your-domain.com;

    # Match server.ts 25MB Excel upload limit
    client_max_body_size 30M;

    # Recommended: protect access with Basic Auth or VPN/SSO
    # auth_basic "HitechDairy Onboarding";
    # auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Required for live SSE streaming (/api/events)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

Enable and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/hitechdairy-ui /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. Persistent Directories & Maintenance

These directories hold runtime data and should reside on persistent storage (and be included in log/cleanup rotation):

| Directory / File | Purpose |
| :--- | :--- |
| `test-data/` | Uploaded and active `.xlsx` workbooks (updated in-place with `Run_Status`). |
| `reports/` | `history.json` (failure-only API exchanges), `run_summary.html`, `row_wise_report.xlsx`, `run_*.log`, `farmer_pre_validation_report.html`. |
| `reports/row_wise/` | Archived row-wise Excel reports (`Excel Row`, `Status`, `Failure Reason`, `ERP Record ID`). Auto-pruned after 14 days. |
| `reports/backups/` | Automatic pre-run `.xlsx` backups (auto-pruned to latest 10 files). |
| `reports/recovery/` | Append-only `.jsonl` crash-recovery logs per run (auto-pruned after 14 days). |
| `reports/ai-intelligence/` | Groq AI failure diagnosis reports (`.md`). |
| `test-results/` | Failure-only screenshots (`submissions/*_failure_*.png`, auto-pruned after 14 days). |
| `storageState.json` | Active ERP API login session (reused for up to `SESSION_MAX_AGE_HOURS=8` hours). |

---

## 7. Operational Notes for DevOps

1. **Single Active Run Constraint:** `src/ui/server.ts` allows **one** onboarding run at a time (which itself runs `1–4` parallel Playwright workers). Concurrent `/api/run` requests while a run is active return an error until the current run finishes or is stopped.
2. **Headless Server Flag:** Always keep `NO_OPEN=1` in `.env` / `systemd` on Linux servers so `server.ts` does not attempt to invoke `xdg-open`.
3. **Excel File Locking:** Workbooks are opened in read/write mode (`r+`). Do not mount `test-data/` over read-only volumes.
4. **Built-In Retention & Resource Optimizations:** At run start, `onboarding.ts` automatically keeps only the latest `10` backups and deletes recovery logs, archived row-wise reports, and failure screenshots older than `14` days. Chromium runs with low-memory flags (`--disable-dev-shm-usage`, `--disable-gpu`, etc.) and blocks non-essential third-party fonts/maps.
5. **CLI Execution (Without Web UI):** Runs can also be triggered via cron or CI directly:
   ```bash
   npx tsx src/onboarding.ts --module=Farmers --parallel --workers=2 --headless
   ```

---

## 8. Automated CI/CD (GitHub Actions $\rightarrow$ Self-Hosted Server)

A CI/CD workflow is configured at `.github/workflows/deploy.yml`. Every push to `main`:
1. Runs `npm install`, `npm run typecheck`, and frontend JS syntax checks (`src/ui/runner.html`, `public/index.html`).
2. Connects to your server over SSH, preserves any local `test-data/` edits, pulls `main`, runs `npm install` + `npx playwright install chromium`, restarts `hitechdairy-ui`, and verifies `http://127.0.0.1:4173/api/files`.

### CI/CD Prerequisites

#### A. Server Setup (One-Time)
Allow the deploy user (e.g., `ubuntu`) to restart the `systemd` service without a password prompt:
```bash
echo "ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart hitechdairy-ui, /bin/systemctl status hitechdairy-ui" | sudo tee /etc/sudoers.d/hitechdairy-ui
sudo chmod 440 /etc/sudoers.d/hitechdairy-ui
```
Ensure the server's SSH key is in `~/.ssh/authorized_keys` and `/opt/hitechdairy-onboarding` is a cloned Git repository on branch `main` with `.env` already created.

#### B. GitHub Repository Secrets
In GitHub (**Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions**), add:

| Secret Name | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `SERVER_HOST` | Yes | Server public IP or domain | `203.0.113.10` |
| `SERVER_USER` | Yes | SSH user on the server | `ubuntu` |
| `SERVER_SSH_KEY` | Yes | Private SSH key (PEM/OpenSSH) matching `authorized_keys` | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SERVER_PORT` | No | SSH port (defaults to `22`) | `22` |
| `SERVER_DEPLOY_PATH` | No | App path on server (defaults to `/opt/hitechdairy-onboarding`) | `/opt/hitechdairy-onboarding` |
| `SERVER_SERVICE_NAME` | No | `systemd` service name (defaults to `hitechdairy-ui`) | `hitechdairy-ui` |
