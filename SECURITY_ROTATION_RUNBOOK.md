# Demo Merchant Credential Rotation

This procedure is intentionally split into an approved dry-run and a separately approved apply step. Never pass credentials as command-line arguments or store them in shell history.

1. Stop application writers during the maintenance window and create a verified SQLite backup.
2. Provide the database path and old/new credentials through a protected environment injection mechanism.
3. Run `npx tsx scripts/rotate-demo-credential.ts` without flags. Review its table counts and orphan/schema checks.
4. Copy the approved count JSON into the protected `AIPP_ROTATION_EXPECTED_COUNTS` environment value.
5. Run `npx tsx scripts/rotate-demo-credential.ts --apply` only after explicit production approval.
6. Confirm the old credential is rejected, the new credential can perform read-only merchant requests, sessions are revoked, passkeys are associated with the replacement identity, and historical counts are unchanged.
7. Deploy the server-only demo configuration and credential-free dashboard atomically. Confirm startup cannot recreate the retired identity.

Rollback requires stopping writers, restoring the verified database backup and prior application/configuration as one coordinated operation. Payment canaries and any fund movement require separate approval.
