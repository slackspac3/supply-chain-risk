# Rollback Playbook

Use this playbook when a pilot release causes regression, failed smoke coverage, or broken shared-user behavior.

## Trigger Conditions

- GitHub Actions smoke checks fail after merge.
- GitHub Pages deploy succeeds but core routes fail or render the wrong release version.
- Vercel API changes break login, settings, or shared user-state reads/writes.
- Pilot users report blocking regressions in auth, assessment flow, or results access.

## Frontend Rollback: GitHub Pages

1. Identify the last known-good commit on `master`.
2. Revert the bad commit or range locally with a normal revert commit.
3. Push the revert commit to `master`.
4. Confirm the `Deploy GitHub Pages` workflow reruns and passes validation.
5. Hard refresh the live Pages site and confirm:
   - the release/version stamp changed back
   - login still renders
   - dashboard still opens
   - a known results page still renders

Preferred command pattern:

```bash
git revert <bad_commit_sha>
git push origin master
```

## Backend Rollback: Vercel API

1. Open the Vercel project deployment history.
2. Promote the last known-good production deployment, or redeploy the matching last known-good commit.
3. Re-check environment variables before promoting if the failing deploy also changed config.
4. Validate:
   - `POST /api/users` login
   - `GET /api/settings`
   - `GET /api/user-state`
   - admin settings write path if the incident touched admin flows

If config changed:

- Restore the previous environment variable set first.
- Redeploy the last known-good backend commit after config rollback.

## Data Safety Notes

- Frontend rollback does not change shared KV data by itself.
- Backend rollback should avoid destructive data migrations because the current pilot model stores JSON documents without formal migrations.
- If a release imported bad demo data, remove or replace those entries manually after rollback rather than wiping the whole store.

## Communication

- Record the failing release version, build, and commit SHA.
- Record which surface was rolled back: frontend, backend, or both.
- Notify pilot users whether they need to sign out and back in again.
- Re-run the release checklist before re-attempting deployment.
