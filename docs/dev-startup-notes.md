# Dev startup notes

If the API server cannot reach the configured database, the app should still start in a degraded mode for local UI development.

- The backend now skips scope seeding when Prisma cannot connect to the database.
- The frontend dev server should continue to proxy requests to http://localhost:4000.
- If port 3000 or 4000 is already in use, stop the conflicting process or choose a different port before restarting the app.
