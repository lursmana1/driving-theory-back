# Deploy on Render

## Build output

Production entry is **`dist/main.js`** (repo root), not `src/dist/main.js`.

## Render settings

| Setting | Value |
|--------|--------|
| **Root Directory** | *(empty)* — use the repository root, **not** `src` |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start:prod` or `node dist/main.js` |

If **Root Directory** is set to `src`, Render looks for `src/dist/main.js` and fails. Clear it or set it to `.`.

## Environment

Use PostgreSQL on Neon (or Render Postgres). See `DEPLOY_NOTES.md` for the full checklist.

Minimum:

```env
DB_TYPE=postgres
DATABASE_URL=<Neon connection string>
DB_SYNCHRONIZE=false
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://your-api.onrender.com/auth/google/callback
```

Render sets `PORT` automatically.
