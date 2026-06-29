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
pm2 start "npx tsx index.ts" --name "aipp-gateway"
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

## 8. Post-Deployment Verification (Staging Sanity Check)

To guarantee 100% transactional reliability and verify that funds routing, webhook callbacks, and split-commissions function correctly in production before launching publicly, perform the following dry-run tests:

### Step A: Register a Real Test Merchant
1. Navigate to your live landing page: `https://your-domain.com`
2. Scroll to the **Live Demo (Setup Shop)** block.
3. Input a real, active personal Lightning Address (e.g., `yourusername@getalby.com` or your Phoenix wallet address).
4. Click **Get API Key** and copy your generated API Key (`aipp_merch_...`).

### Step B: Perform a Small Real Payment (100 Sats)
1. Go to the **Checkout** tab on the live demo.
2. Click **Buy Now** to generate a real BOLT11 invoice.
3. Open a separate mobile Lightning wallet containing a small balance (e.g., Phoenix, Strike, Alby, Breez).
4. Scan the QR code or copy the invoice string and pay **100 satoshis** (approx. $0.03).

### Step C: Verify Payout & Ledger Integrity
1. Once paid, check the **Payout Status** tab to confirm the payment was detected.
2. Verify in your merchant cüzdan (receiver wallet) that you instantly received **99 satoshis** (99% split forwarding).
3. Access your developer dashboard (`https://your-domain.com/dashboard.html`), log in with your API key, and check:
   * **Volume Routed**: Should register 100 sats.
   * **AIPP Commission (1%)**: Should register 1 sat.
   * **Transactional Ledger**: The transaction status must be marked as `settled` with split details.

---

Your pass-through payment gateway is now live, secure (HTTPS), protected, and running in production!
