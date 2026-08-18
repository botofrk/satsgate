#!/usr/bin/env bash

# AIPP.dev Production Autodeploy Script
# Run this on your Hetzner server to deploy/update the payment gateway.

set -e

PROJECT_DIR="/var/www/aipp"
LOG_DIR="/var/www/backups"
DATA_DIR="/var/www/aipp-data"

echo "=== STARTING AIPP.dev DEPLOYMENT ==="

# 1. Ensure directory structure exists
echo "[1/6] Setting up directories..."
sudo mkdir -p "$PROJECT_DIR"
sudo mkdir -p "$LOG_DIR"
sudo mkdir -p "$DATA_DIR"
sudo chown -R $USER:$USER "$PROJECT_DIR"
sudo chown -R $USER:$USER "$DATA_DIR"

# 2. Sync files or pull latest git changes
if [ -d "$PROJECT_DIR/.git" ]; then
    echo "[2/6] Updating repository..."
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo "[2/6] Initializing repository..."
    git clone https://github.com/aippde/aipp-key.git "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# 3. Create placeholder .env if not exists
if [ ! -f ".env" ]; then
    echo "[3/6] Creating template .env file from example..."
    cp .env.example .env
    echo "⚠️  Template .env created at $PROJECT_DIR/.env"
    echo "⚠️  CRITICAL: Update it with your real credentials before starting!"
    echo "     Required: LNBITS_INVOICE_KEY, LNBITS_ADMIN_KEY, LNBITS_WEBHOOK_SECRET"
    exit 1 # Stop deployment so user fills in credentials
else
    echo "[3/6] .env file already exists."
    # Verify critical keys are set
    source .env
    if [ -z "$LNBITS_ADMIN_KEY" ] || [ "$LNBITS_ADMIN_KEY" = "your_lnbits_admin_key_here" ]; then
        echo "❌ ERROR: LNBITS_ADMIN_KEY is not set in .env! Payouts will not work."
        exit 1
    fi
    if [ -z "$LNBITS_WEBHOOK_SECRET" ] || [ "$LNBITS_WEBHOOK_SECRET" = "change_this_to_a_long_random_string" ]; then
        echo "⚠️  WARNING: LNBITS_WEBHOOK_SECRET is not set. Webhook spoofing is possible."
    fi
fi

# 4. Ensure NODE_ENV=production in .env
if ! grep -q "NODE_ENV=production" .env; then
    echo "NODE_ENV=production" >> .env
    echo "[3/6] Added NODE_ENV=production to .env"
fi

# 5. Symlink database to persistent data directory
if [ ! -f "$DATA_DIR/aipp.db" ] && [ -f "$PROJECT_DIR/aipp.db" ]; then
    echo "[4/6] Moving existing database to persistent location..."
    mv "$PROJECT_DIR/aipp.db" "$DATA_DIR/aipp.db"
fi
if [ ! -L "$PROJECT_DIR/aipp.db" ]; then
    echo "[4/6] Linking database to persistent storage at $DATA_DIR/aipp.db..."
    ln -sf "$DATA_DIR/aipp.db" "$PROJECT_DIR/aipp.db"
fi

# 6. Install NPM dependencies
echo "[5/6] Installing npm dependencies..."
npm install

# 7. Launch/Restart application under PM2 daemon
echo "[6/6] Restarting application daemon with PM2..."
if pm2 show aipp-gateway > /dev/null 2>&1; then
    echo "PM2 process already exists. Restarting..."
    pm2 restart aipp-gateway
else
    echo "Registering new PM2 process..."
    pm2 start "npx tsx index.ts" --name "aipp-gateway" --env production
    pm2 save
fi

echo ""
echo "=== AIPP.dev DEPLOYMENT COMPLETED SUCCESSFULLY ==="
echo "Verify running status with: pm2 status"
echo "View application logs with: pm2 logs aipp-gateway"
echo ""
echo "📌 Post-deploy checklist:"
echo "   1. Test: curl https://aipp.dev/health"
echo "   2. Test: curl -X POST https://aipp.dev/lnbits-webhook (should return 401 if webhook secret is set)"
echo "   3. Set LNBits webhook URL to: https://aipp.dev/lnbits-webhook"
echo "   4. Set LNBits webhook secret to the value in your .env LNBITS_WEBHOOK_SECRET"
