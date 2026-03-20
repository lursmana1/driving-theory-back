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

Add the same variables as local `.env` (`MONGODB_URI`, `DB_*`, `JWT_*`, `PORT`, etc.). Render sets `PORT` automatically.
