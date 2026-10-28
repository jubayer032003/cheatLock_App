# Render with local teacher/admin dashboards

The backend runs on Render; the frontend runs in a local browser. CORS must
contain the browser frontend origins, not GitHub repository URLs or the backend
URL. The configured Vite development ports are teacher 5174 and admin 5175.

Set these environment variables on the existing Render backend service:

```dotenv
CLIENT_ORIGIN=http://localhost:5174
ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175
```

Replace the old wildcard value, then save and redeploy. Do not add paths,
quotes, or trailing commas. If the frontend is opened using a different hostname
or port, add its exact origin. When hosting the frontend publicly, add its actual
HTTPS origin as well. Native Android requests without an Origin header remain
supported; authentication is still required on protected endpoints.

The compatibility fix discards a stale wildcard only when explicit valid origins
are also configured. Wildcard-only production configuration still fails with a
message naming the variables to correct. Browser credentials remain disabled.

`npm audit` findings are separate from this startup exception. Do not run
`npm audit fix --force` as a deployment workaround.
