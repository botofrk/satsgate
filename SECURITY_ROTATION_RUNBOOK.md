# Demo Merchant Credential Rotation

This procedure is intentionally split into an approved dry-run and a separately approved apply step. Never pass credentials as command-line arguments or store them in shell history.

1. Stop application writers during the maintenance window and create a verified SQLite backup.
2. Provide the database path and old/new credentials through a protected environment injection mechanism.
3. Run `npx tsx scripts/rotate-demo-credential.ts` without flags. Any orphan refuses by default.
4. To document known unrelated orphans, set a new protected `AIPP_ROTATION_APPROVED_PREFLIGHT_FILE` path and run with `--allow-existing-orphans-unchanged`. Dry-run opens SQLite read-only and writes only the integrity-sealed approval artifact.
5. Review the artifact and exact counts. It contains schema/DB identity, masked identity fingerprints and row fingerprints, never raw credentials.
6. For apply, provide the approved counts in protected `AIPP_ROTATION_EXPECTED_COUNTS`, the unchanged artifact, and both `--apply --allow-existing-orphans-unchanged`. Target orphans, stale/tampered artifacts, schema/DB identity drift, or any orphan addition/removal/content/identity change refuse or roll back.
7. Existing target sessions are revoked and migrated; passkeys migrate. Unrelated orphan rows are neither repaired nor adopted.
8. Confirm the old credential is rejected, the new credential can perform read-only merchant requests, sessions are revoked, passkeys are associated with the replacement identity, and historical counts are unchanged.
9. Deploy the server-only demo configuration and credential-free dashboard atomically. Confirm startup cannot recreate the retired identity.

Rollback requires stopping writers, restoring the verified database backup and prior application/configuration as one coordinated operation. Payment canaries and any fund movement require separate approval.
