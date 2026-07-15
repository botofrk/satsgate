#!/usr/bin/env bash

# SSH Debugging Script for Hetzner Server
# Run this on the server as root to clear all blocks for IP 88.230.83.66

TARGET_IP="88.230.83.66"

echo "=== DIAGNOSING BLOCKS FOR IP: $TARGET_IP ==="

# 1. Unban from Fail2ban
echo "[1] Checking Fail2ban..."
if command -v fail2ban-client &> /dev/null; then
    # Get all jails and unban from them
    jails=$(fail2ban-client status | grep "Jail list:" | sed "s/.*Jail list://g" | tr -d "," | tr "\n" " ")
    for jail in $jails; do
        echo "Unbanning $TARGET_IP from jail: $jail"
        fail2ban-client set $jail unbanip $TARGET_IP || true
    done
else
    echo "Fail2ban not installed."
fi

# 2. Check and remove iptables drop rules
echo "[2] Checking iptables rules..."
# Remove any REJECT/DROP rules matching the target IP
iptables -S | grep "$TARGET_IP" | while read -r rule; do
    echo "Removing iptables rule: $rule"
    del_rule=$(echo "$rule" | sed 's/-A/-D/g')
    iptables $del_rule || true
done

# 3. Check UFW status and add explicit allow
echo "[3] Checking UFW..."
if command -v ufw &> /dev/null; then
    echo "Allowing IP in UFW..."
    ufw allow from $TARGET_IP to any port 22 proto tcp
    ufw allow from $TARGET_IP to any port 2222 proto tcp
    ufw reload
else
    echo "UFW not active/installed."
fi

# 4. Verify SSH daemon is running
echo "[4] Verifying SSH daemon status..."
systemctl status sshd || systemctl status ssh || echo "SSH service status unknown."

# 5. Reload SSH daemon configuration
echo "[5] Reloading SSH service..."
systemctl reload sshd || systemctl reload ssh || echo "Failed to reload SSH."

echo "=== DIAGNOSTICS COMPLETED ==="
echo "Please ask Faruk to retry the SSH connection now!"
