# AIPP.dev Production Deployment Guide

This guide describes how to deploy and host the **aipp.dev** payment gateway on a production Linux server (Ubuntu/Debian), matching your server specs (16 vCPU, 32GB RAM, 360GB SSD).

---

## 1. Prerequisites & Server Setup

Ensure your server is updated and has the necessary system tools installed:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx
```

### Install Node.js (Node 20+)

Install Node.js using NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify installations:

```bash
node -v
npm -v
```

---

## 2. Project Installation

Clone your repository (or copy your code files) into a web root directory like `/var/www/aipp`:

```bash
sudo mkdir -p /var/www/aipp
sudo chown -R $USER:$USER /var/www/aipp
cd /var/www/aipp

# Install dependencies
npm install
```

---

## 3. Environment Configuration

Create a production `.env` file in `/var/www/aipp`:

```env
PORT=3000
LNBITS_URL=https://legend.lnbits.com
LNBITS_INVOICE_KEY=your_lnbits_read_invoice_key
LNBITS_ADMIN_KEY=your_lnbits_admin_write_key
AIPP_RECEIPT_SECRET=generate_a_long_random_value
```

Make sure to replace `LNBITS_URL`, `LNBITS_INVOICE_KEY`, and `LNBITS_ADMIN_KEY` with your actual LNBits server credentials.

---

## 4. Run Process in Background with PM2

Install **PM2** globally to monitor and run the Node.js application permanently:

```bash
sudo npm install -y -g pm2
```

### Build & Start the App

Start the application with PM2 (using tsx runner for TypeScript):

```bash
pm2 start "npx tsx src/server.ts" --name "aipp-gateway"
```

Configure PM2 to automatically start the application when the server reboots:

```bash
pm2 startup
# (Run the command outputted by the screen to register the startup service)
pm2 save
```

Useful PM2 commands:

*   `pm2 status` - View status of processes.
*   `pm2 logs aipp-gateway` - View live logs.
*   `pm2 restart aipp-gateway` - Restart process.

---

## 5. Nginx Reverse Proxy Setup

Nginx will receive incoming traffic on ports 80/443 (HTTP/HTTPS) and route it to your local node process running on port 3000.

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/aipp.conf
```

Paste the following configuration:

```nginx
server {
    listen 80;
    server_name aipp.dev www.aipp.dev; # Replace with your domains or IP

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the configuration and reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/aipp.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Secure Server with SSL (Let's Encrypt)

Install **Certbot** and request a free, auto-renewing SSL certificate:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d aipp.dev -d www.aipp.dev
```

Follow the prompts. Certbot will automatically rewrite the Nginx file to enable SSL redirection.

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

---

## 7. Production Security & Backups

### Nightly Database Backups (SQLite Safety)
Because SQLite uses a single file (`aipp.db`), hardware crashes can result in data loss. Setup a daily cron job to backup the file:

```bash
# Create directory for backups
mkdir -p /var/www/backups

# Open crontab configuration
crontab -e
```

Add the following line to backup the database every night at 3:00 AM:
```bash
0 3 * * * cp /var/www/aipp/aipp.db /var/www/backups/aipp_$(date +\%F).db
```

### PM2 Log Rotation (Prevent Disk Bloat)
Prevent the server disk from filling up with debug/console logs by installing the standard PM2 logrotator:
```bash
pm2 install pm2-logrotate
```

Defaults are set to automatically rotate logs once they hit 10MB or daily.

---

## 8. Post-Deployment Verification (Staging Canary Plan)

To verify routing, webhook callbacks, and canonical 3% fee accounting after deployment, run the following distinct canary checks:

### Canary 1: Lightning Pricing-Distinction Canary (34 Sats Gross)
* **Rationale:** Distinctly separates 3% policy from legacy 1% policy.
  * Legacy 1% policy: $\lceil 34 \times 1\% \rceil + 5 = 1 + 5 = 6\text{ sats fee}$
  * New 3% policy: $\lceil 34 \times 3\% \rceil + 5 = 2 + 5 = 7\text{ sats fee}$
* **Gross Customer Payment:** `34 sats`
* **Persisted AIPP Fee:** `7 sats` ($\lceil 34 \times 3\% \rceil = 2\text{ sats percentage} + 5\text{ sats fixed}$)
* **Persisted Merchant Net:** `27 sats` ($34 - 7$)
* **Verification:** Confirm that checkout displays 34 sats gross, receipt reports 7 sats fee / 27 sats net, and dashboard shows authentic persisted breakdown.

### Canary 2: Base USDC Minimum-Fee Canary ($0.010000 Gross)
* **Gross Customer Payment:** `0.010000 USDC` (`10,000 native units`)
* **Persisted AIPP Fee:** `0.001000 USDC` (`1,000 units` — minimum fee bound)
* **Persisted Merchant Net:** `0.009000 USDC` (`9,000 units`)
* **Verification:** Confirm on-chain ERC-20 payout forwards exactly `9,000 integer units`, leaving `1,000 units` on Gateway.

### Canary 3: Base USDC Percentage-Fee Canary ($0.040000 Gross)
* **Rationale:** Independently validates the 3% calculation above the $0.001 minimum boundary.
* **Gross Customer Payment:** `0.040000 USDC` (`40,000 native units`)
* **Persisted AIPP Fee:** `0.001200 USDC` (`1,200 units` — $40,000 \times 3\%$)
* **Persisted Merchant Net:** `0.038800 USDC` (`38,800 units`)
* **Verification:** Confirm on-chain ERC-20 payout forwards exactly `38,800 integer units`, leaving `1,200 units` on Gateway.

---

## 9. Safe Production Rollback & Recovery Plan

Under no circumstances execute destructive history rewrites (such as `git reset --hard`) on production servers. Use the following deterministic, non-destructive rollback procedures:

### A. Pre-Deployment Tagging & Database Backup
Before deploying any release to production, execute:

```bash
# 1. Tag the active stable release
git tag -a v1.0.0-pre-3pct-stable -m "Stable pre-deployment checkpoint"
git push origin v1.0.0-pre-3pct-stable

# 2. Create timestamped SQLite hot backup using safe online backup API
mkdir -p /home/hermes/backups
sqlite3 /home/hermes/aipp/aipp-key/data/aipp.db ".backup '/home/hermes/backups/aipp_backup_$(date +%Y%m%d_%H%M%S).db'"

# 3. Tag current running Docker image
docker tag aipp-key:latest aipp-key:pre-3pct-stable
```

### B. Recoverable Container Rollback (Preserving Failed Container)

To roll back while preserving the failed container for post-mortem investigation without name collisions:

```bash
ROLLBACK_STAMP=$(date +%Y%m%d_%H%M%S)

# 1. Stop active container
docker stop aipp-key

# 2. Rename failed container to preserve state and free name
docker rename aipp-key "aipp-key-failed-$ROLLBACK_STAMP"

# 3. Launch pre-deployment stable image
docker run -d \
  --name aipp-key \
  --restart unless-stopped \
  -v /home/hermes/aipp/aipp-key/data:/app/data \
  -p 3000:3000 \
  --env-file /home/hermes/aipp/aipp-key/.env \
  aipp-key:pre-3pct-stable
```

#### Verification After Rollback
```bash
docker ps --filter name=aipp-key
curl -fsS https://aipp.dev/health
```

#### Reversing Rollback (If Rollback Was Premature)
If you need to switch back to the newer deployment without rebuilding:
```bash
docker stop aipp-key
docker rm aipp-key
docker rename "aipp-key-failed-$ROLLBACK_STAMP" aipp-key
docker start aipp-key
```

### C. Git Revert (Audit-Safe Alternative)
```bash
# For a normal commit:
git revert <commit-sha> --no-edit

# For a merge commit only:
git revert -m 1 <merge-commit-sha> --no-edit

# Rebuild and restart
npm install
npm test
pm2 restart aipp-gateway # (or rebuild docker image)
```

> [!CAUTION]
> Never use destructive commands like `git reset --hard` or attempt to checkout detached tags in an active production worktree.

### D. Database Backward Compatibility
All schema updates for fee versioning are strictly **additive** (`ALTER TABLE ... ADD COLUMN ...`). Previous application versions can safely interact with the database without rolling back migrations or altering existing tables. Database restoration from backup is unnecessary unless unrecoverable corruption occurs.

---

Your pass-through payment gateway is now live, secure (HTTPS), protected, and running in production!
