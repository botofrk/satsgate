# AIPP Project Configuration

This rule contains critical connection details for the AIPP project. **Always refer to these details** when you need to deploy, test, or push code. DO NOT ask the user for these details again.

## Remote Server & SSH
- **Server IP/User:** `root@89.167.84.31`
- **SSH Key Path (Local):** `C:\Users\ucala\.ssh\id_ed25519`
- **Project Path on Server:** `/home/hermes/aipp/aipp-key`
- **Docker Container Name:** `aipp-key`
- **Standard SSH Command:** `ssh -o StrictHostKeyChecking=no -i C:\Users\ucala\.ssh\id_ed25519 root@89.167.84.31`
- **Standard SCP Command:** `scp -o StrictHostKeyChecking=no -i C:\Users\ucala\.ssh\id_ed25519 <file> root@89.167.84.31:/home/hermes/aipp/aipp-key/`

## GitHub Configuration
- **GitHub Username:** `botofrk`
- **GitHub Repository:** `satsgate.git`
- **GitHub Token:** `[SET_VIA_ENV_OR_SECRET]`
- **Authentication Method:** Use SSH or token authenticated HTTPS URL for pushing/pulling.

## Project Architecture
- The main website (`index.html`, `dashboard.html`) is served directly from the root path via Express static files.
- When updating frontend or backend files, copy them to the server `/home/hermes/aipp/aipp-key` AND into the running Docker container using `docker cp /home/hermes/aipp/aipp-key/public/. aipp-key:/app/public/ && docker cp /home/hermes/aipp/aipp-key/src/. aipp-key:/app/src/`.
