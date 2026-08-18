#!/bin/bash
# LEGACY: do not use for Open Tag production releases. It can rewrite compose
# configuration. Use ./deploy_open_tag.sh and DEPLOY_OPEN_TAG.md instead.
# AIPP-KEY Deploy Script - Sunucuda çalıştırın
set -e

CORE_DIR="/home/hermes/aipp/core"
AIPP_KEY_DIR="$CORE_DIR/aipp-key"

echo "=== [1/5] aipp-key dizini hazırlanıyor ==="
mkdir -p "$AIPP_KEY_DIR"
cp -r /var/www/aipp-key/* "$AIPP_KEY_DIR/"
cp /var/www/aipp-key/.env "$AIPP_KEY_DIR/.env" 2>/dev/null || true

echo "=== [2/5] Dockerfile düzenleniyor (tsx, port 3000) ==="
cat > "$AIPP_KEY_DIR/Dockerfile" << 'DOCKER_EOF'
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
VOLUME ["/app/data"]
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npx", "tsx", "index.ts"]
DOCKER_EOF

echo "=== [3/5] docker-compose.yml güncelleniyor ==="
# Mevcut dosyayı yedekle
cp "$CORE_DIR/docker-compose.yml" "$CORE_DIR/docker-compose.yml.bak.$(date +%Y%m%d_%H%M%S)"

# aipp-key service ekle (frontend'in yerine)
python3 << 'PYEOF'
import re

with open('/home/hermes/aipp/core/docker-compose.yml', 'r') as f:
    content = f.read()

# Zaten ekliyse atla
if 'aipp-key' in content:
    print("aipp-key service zaten mevcut, atlanıyor.")
    exit(0)

new_service = '''
  aipp-key:
    build:
      context: ./aipp-key
      dockerfile: Dockerfile
    container_name: aipp-key
    env_file:
      - ./aipp-key/.env
    volumes:
      - aipp_key_data:/app/data
    restart: unless-stopped
    networks:
      - aipp_net
      - dokploy-network
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=dokploy-network"
      - "traefik.http.routers.aipp-key.rule=Host(`aipp.dev`) || Host(`www.aipp.dev`)"
      - "traefik.http.routers.aipp-key.entrypoints=websecure"
      - "traefik.http.routers.aipp-key.tls=true"
      - "traefik.http.routers.aipp-key.tls.certresolver=letsencrypt"
      - "traefik.http.services.aipp-key.loadbalancer.server.port=3000"
'''

# volumes altına aipp_key_data ekle
content = content.replace(
    '  aipp_lnbits_data:',
    '  aipp_lnbits_data:\n  aipp_key_data:'
)

# services bölümüne yeni servisi ekle (dashboard'dan önce)
content = content.replace(
    '  dashboard:',
    new_service + '\n  dashboard:'
)

with open('/home/hermes/aipp/core/docker-compose.yml', 'w') as f:
    f.write(content)

print("aipp-key service başarıyla eklendi!")
PYEOF

echo "=== [4/5] Docker image build & up ==="
cd "$CORE_DIR"
docker compose build aipp-key
docker compose up -d aipp-key

echo "=== [5/5] Servis durumu ==="
sleep 5
docker ps | grep aipp-key
docker logs aipp-key --tail 20

echo ""
echo "✅ DEPLOY TAMAMLANDI!"
echo "   Test: curl https://aipp.dev/health"
echo "   Test: curl -X POST https://aipp.dev/lnbits-webhook -H 'Content-Type: application/json' -d '{\"test\":true}'"
