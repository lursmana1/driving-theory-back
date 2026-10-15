# driving-theory-back

NestJS 11 + TypeORM + PostgreSQL API for **prava.ge** (Georgian driving-theory exam prep, ka/ru/en).
API and maintenance scripts only — the Next.js frontend lives in another repo.

## Commands

```bash
npm run start:dev                          # watch mode, port 3000
npx tsc -p tsconfig.build.json --noEmit    # type-check
npx eslint "src/**/*.ts"                   # lint without rewriting (npm run lint uses --fix)
npm test                                   # jest unit specs (src/**/*.spec.ts), ~90 s
npx jest src/path/to/file.spec.ts          # single spec
npm run build                              # tsc -> dist/
```

`npm run db:*`, `sync:*`, `audio:*`, `import:*` write to the database, S3 or paid APIs using whatever
`.env` points at. Never run them unless the user asks for that specific run.

## Rules

The rule files below are the single source of truth, shared with Cursor. Edit them there, not here.

- How to write and verify code: @.cursor/rules/engineering-standards.mdc
- Module map, APIs, helpers to reuse: @.cursor/rules/project-architecture.mdc
- Known bugs and patterns not to copy: @.cursor/rules/known-weaknesses.mdc

For feature work also read `.cursor/rules/product-roadmap.mdc` and keep its order.

## Non-negotiables

- Verify with tsc, eslint and jest before reporting a change as done; report failures as failures.
- Say what was not verified. Passing unit tests is not "tested and working": SQL, real requests and the frontend contract need a run on `dev` before `main`.
- Tightening validation on an existing route can break working clients: list the inputs that now return 400.
- Every new route states its guard; every input goes through a bounded DTO; every user query is scoped by `req.user.userId`.
- No request value is ever interpolated into SQL.
- An entity change is not a schema change in production — ship an idempotent script with it.
- Do not read or print `.env`, `google-cloud-key.json`, `backups/` or `infra/`.
