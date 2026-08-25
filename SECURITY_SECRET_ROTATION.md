# CheatLock Secret Rotation Plan

This document covers repository remediation for exposed secret categories. It does not contain old values and must not be used to store new values.

## 1. Secret Categories That Require Rotation

Rotate any real values that were ever committed or used from these categories:

- JWT signing secrets.
- MongoDB connection credentials and connection URIs.
- Redis credentials or credential-bearing Redis URLs.
- S3 or MinIO access keys and secret keys.
- Kubernetes Secret values, including any previously committed base64-encoded data.
- Firebase or mobile service configuration if the connected project treats any field as restricted.
- Webhook, email, cloud, storage, CI, or deployment tokens if later scans find them in tracked files or build logs.

## 2. Why Latest-Commit Deletion Is Insufficient

Removing a secret from the current tree does not invalidate copies in Git history, forks, local clones, CI logs, container layers, deployment records, package artifacts, screenshots, or caches. Any real credential that was committed should be treated as exposed until the issuing system rotates or revokes it.

## 3. Safe Rotation Order

1. Inventory affected systems without printing old values.
2. Create replacement credentials in the source system or secret manager.
3. Update staging secret stores.
4. Deploy staging and verify health.
5. Update production secret stores.
6. Roll production workloads.
7. Revoke old credentials.
8. Verify old credentials fail.
9. Review logs/artifacts for accidental exposure.

## 4. How To Rotate Without Printing Old Values

- Use secret-manager CLIs or web consoles that hide values by default.
- Redirect generated credentials directly into secret stores when supported.
- Avoid shell history by using secure prompts or temporary files in ignored directories.
- Never paste old or new values into issue trackers, chat, commit messages, docs, or test fixtures.

## 5. Updating Deployment Systems

- Local Docker Compose: put values in an ignored `.env` file based on `.env.example`.
- Kubernetes: update the `cheatlock-secret` Secret with `kubectl`, External Secrets, Sealed Secrets, or a managed secret provider.
- CI/CD: store values in the CI secret store only, not workflow YAML.
- Render or other PaaS: update environment variables through the provider dashboard or CLI.

Example Kubernetes command shape, using placeholders only:

```powershell
kubectl -n cheatlock create secret generic cheatlock-secret --dry-run=client -o yaml `
  --from-literal=MONGODB_URI="replace-with-mongodb-uri" `
  --from-literal=JWT_SECRET="replace-with-a-long-random-value" `
  --from-literal=REDIS_URL="replace-with-redis-url" `
  --from-literal=S3_ENDPOINT="replace-with-s3-endpoint" `
  --from-literal=S3_BUCKET="replace-with-s3-bucket" `
  --from-literal=S3_ACCESS_KEY="replace-with-s3-access-key" `
  --from-literal=S3_SECRET_KEY="replace-with-s3-secret-key" `
  --from-literal=S3_REGION="us-east-1" | kubectl apply -f -
```

## 6. Invalidating Old Credentials

- JWT: change the signing secret and require all users to sign in again.
- MongoDB: rotate user passwords or connection credentials, then disable old users/passwords.
- Redis: rotate ACL users/passwords or managed-service credentials.
- S3/MinIO: create new keys, update deployments, then revoke old keys.
- Firebase/service providers: rotate restricted keys where supported and update allowed app/package restrictions.

## 7. Verifying Old Credentials No Longer Work

- Test old credentials only through safe negative checks that do not print them.
- Confirm old database users cannot authenticate.
- Confirm old S3 keys cannot list, read, or write objects.
- Confirm old JWTs fail authentication after service restart.
- Confirm old CI/deployment variables are no longer present in provider settings.

## 8. Git History Cleanup

History cleanup may be necessary if real credentials were committed. Use tools such as `git filter-repo` or BFG Repo-Cleaner only after rotation. Do not run history rewrite from an ordinary feature branch without an approved team plan.

## 9. Team Coordination for History Rewriting

History rewriting changes commit IDs and disrupts open branches, forks, pull requests, release tags, and deployment references. Coordinate a freeze window, notify all contributors, back up the repository, rotate first, rewrite second, force-push only with approval, then require fresh clones or careful branch repair.

## 10. Exposure Review Checklist

Review these systems for copied secrets:

- CI logs and artifacts.
- Docker image layers and registries.
- Kubernetes events, manifests, and deployment records.
- PaaS environment history.
- Local developer shells and command history.
- Issue trackers, chat messages, screenshots, and documents.
- Build outputs, APKs, desktop bundles, and generated archives.

Keep the review redacted: record paths, dates, and categories, not values.
