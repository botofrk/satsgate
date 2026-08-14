# Deployment information

Do not store production IP addresses, usernames, local key paths, database paths
or exact container topology in the source repository.

Use deployment-secret variables or the hosting platform's protected runbook:

- `AIPP_DEPLOY_HOST`
- `AIPP_DEPLOY_USER`
- `AIPP_DEPLOY_PATH`
- `AIPP_SSH_KEY_PATH`
- `AIPP_CONTAINER_NAME`

Host verification must remain enabled. Back up the database before deployment,
deploy from a reviewed commit, then verify `/health`, invoice creation, payment
status and payout processing in staging before production.
