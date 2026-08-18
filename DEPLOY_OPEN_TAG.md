# Phoenix-safe Open Tag deployment

Use `deploy_open_tag.sh` instead of the legacy deployment scripts. It defaults
to a read-only preflight and refuses to deploy when Phoenix is not running with
a persistent mount.

## 1. Configure the existing server environment

Do not replace the production `.env`. Add one new secret to the existing file:

```bash
openssl rand -hex 32
```

Store the result as:

```env
AIPP_RECEIPT_SECRET=the_generated_value
```

Never use a Phoenix seed, wallet password, LNbits key or channel secret for
this value.

## 2. Discover the real compose service names

```bash
docker compose -f /home/hermes/aipp/core/docker-compose.yml config --services
```

The current expected names are `aipp-key` and `phoenixd`, but pass the actual
server names if they differ.

## 3. Run read-only preflight

From the AIPP source directory:

```bash
chmod +x deploy_open_tag.sh
./deploy_open_tag.sh \
  --compose-file /home/hermes/aipp/core/docker-compose.yml \
  --service aipp-key \
  --phoenix-service phoenixd
```

This does not build, restart or modify a service.

## 4. Deploy only AIPP

```bash
./deploy_open_tag.sh --deploy \
  --compose-file /home/hermes/aipp/core/docker-compose.yml \
  --service aipp-key \
  --phoenix-service phoenixd \
  --health-url https://aipp.dev/health \
  --tag-id p_YOUR_STAGING_TAG
```

The script backs up `.env`, compose configuration and the host SQLite database
(including WAL/SHM files when present),
runs `npm ci`, build and tests, then executes only:

```bash
docker compose build aipp-key
docker compose up -d --no-deps aipp-key
```

It records Phoenix identity, start time and mounts before deployment and fails
if any of them change afterward.

## Explicitly forbidden operations

Do not run these as part of an AIPP application release:

```text
docker compose down
docker compose down -v
docker system prune --volumes
docker volume prune
```

Do not overwrite `.env`, recreate `phoenixd`, rename its volume or copy a new
wallet database over its mounted data directory.

## Application rollback

The timestamped backup directory contains the previous AIPP image ID,
configuration snapshot, health response and failure logs. If rollback is
needed, restore only the AIPP application/image and its own database backup.
Do not include `phoenixd`, `lnbits` or their volumes in the rollback command.
