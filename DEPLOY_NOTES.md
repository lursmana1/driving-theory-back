# Deployment Notes

## Render — PostgreSQL (Neon)

The app uses **PostgreSQL only** via TypeORM. MongoDB and MySQL are no longer used at runtime.

### Required env vars

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://USER:PASS@HOST/neondb?sslmode=require
DB_SYNCHRONIZE=false
JWT_SECRET=<strong random string>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://YOUR-API.onrender.com/auth/google/callback
GOOGLE_REDIRECT_AFTER_LOGIN=https://YOUR-FRONTEND.com
AWS_REGION=...
AWS_S3_BUCKET=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_PUBLIC_BASE_URL=...
```

`DATABASE_URL` is read first (Neon connection string). SSL is enabled automatically when the URL contains `neon.tech` or `sslmode=require`.

### Do not set on Render

- `MONGODB_URI` / `MONGODB_DB` — not used by the app anymore
- MySQL `DB_HOST` / `DB_PORT` — not used unless `DB_TYPE=mysql` (legacy)

### Checklist after deploy

- [ ] `DATABASE_URL` set (Neon production branch)
- [ ] `DB_TYPE=postgres`
- [ ] `DB_SYNCHRONIZE=false`
- [ ] `JWT_SECRET` set
- [ ] Google OAuth URLs point to production API + frontend
- [ ] AWS S3 vars set (blog uploads)
- [ ] `GET /categories` returns 10 categories
- [ ] `GET /questions?lang=ka&category=1&page=1` returns `total > 0` with Georgian text

### Build / start (Render)

| Setting | Value |
|--------|--------|
| Root Directory | *(empty)* |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start:prod` |

Production entry: **`dist/main.js`** (repo root).
