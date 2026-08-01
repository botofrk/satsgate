# AIPP.dev Sunucu ve Proje Bilgileri

Bu dosya, `aipp-key` projesinin canlı sunucu bağlantı bilgilerini, GitHub repo detaylarını ve sunucu üzerindeki kritik yolları içerir. Sonraki çalışmalarda doğrudan bu bilgilere başvurulmalıdır.

## 🌍 Canlı Sunucu Bağlantı Bilgileri
- **IP Adresi:** `89.167.84.31`
- **Kullanıcı Adı:** `root`
- **SSH Portu:** `22` (Önceden 2222 denenmişti ama 22 aktif kullanılıyor)
- **SSH Key Yolu (Local):** `C:\Users\ucala\.ssh\id_ed25519`
- **Bağlantı Komutu:**
  ```bash
  ssh -o StrictHostKeyChecking=no -i C:\Users\ucala\.ssh\id_ed25519 root@89.167.84.31
  ```

## 📂 Sunucu Üzerindeki Proje Yolları (Dokploy/Traefik)
- **Proje Kaynak Kodu:** `/home/hermes/aipp/aipp-key/`
- **Docker Compose Dosyası:** `/home/hermes/aipp/core/docker-compose.yml` (Ancak aipp-key şu an bağımsız docker run komutuyla Traefik'e bağlı çalıştırıldı, kalıcı olması için ileride compose'a eklenebilir)
- **Traefik Config (Dynamic):** `/etc/dokploy/traefik/dynamic/aipp-key.yml`
- **SQLite DB (Kalıcı Volume):** `/home/hermes/data/aipp-key/aipp.db`
- **DB Yedek Klasörü (Cron):** `/var/www/backups/aipp-key/`
- **Aktif .env Dosyası:** `/home/hermes/aipp/aipp-key/.env`

## 🐳 Docker Bilgileri
- **Image Adı:** `aipp-key:latest`
- **Container Adı:** `aipp-key`
- **Logları Görmek İçin:** `docker logs aipp-key --tail 50`
- **Manuel Restart ve Build:**
  ```bash
  cd /home/hermes/aipp/aipp-key
  docker build -t aipp-key:latest .
  docker stop aipp-key && docker rm aipp-key
  docker run -d --name aipp-key --restart unless-stopped --env-file /home/hermes/aipp/aipp-key/.env -v /home/hermes/data/aipp-key:/app/data --network dokploy-network --label traefik.enable=true --label traefik.docker.network=dokploy-network --label 'traefik.http.routers.aipp-key.rule=Host(`aipp.dev`) || Host(`www.aipp.dev`)' --label traefik.http.routers.aipp-key.entrypoints=websecure --label traefik.http.routers.aipp-key.tls=true --label traefik.http.services.aipp-key.loadbalancer.server.port=3000 aipp-key:latest
  ```

## 🐙 GitHub Bilgileri
- **Repo URL:** `https://github.com/botofrk/satsgate.git`
- **Remote Adı:** `origin`
- **Branch:** `main`

## 🌐 Domainler
- `aipp.dev`
- `www.aipp.dev`
