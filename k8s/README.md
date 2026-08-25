# CheatLock Kubernetes Secrets

`cheatlock-deployment.yaml` contains placeholder-only secret data. Operators must replace it through an approved secret-management process before deploying.

Required keys:

- `MONGODB_URI`
- `JWT_SECRET`
- `REDIS_URL`
- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_REGION`

Safe command shape with placeholders:

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

Do not commit real generated Secret manifests. Local overrides matching secret-file patterns are ignored by `.gitignore`.
