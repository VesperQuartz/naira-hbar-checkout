# storage

Drizzle ORM + Postgres storage package for the monorepo. It exports the shared
`db` client (see `src/index.ts`) and the table definitions in `src/schema/`.

## Local database

The repo root has a `docker-compose.yml` that starts Postgres on host port
**5433** (the default in `DATABASE_URL` and in `drizzle.config.ts`):

```bash
# run from the repo root
docker compose up -d      # start Postgres
docker compose down       # stop it (data is kept)
docker compose down -v    # stop it and delete the data
```

Copy the repo root `.env.example` to `.envrc` (direnv) or `.env` if you want
to override the default credentials or port.

`DATABASE_URL` is optional. When it is not set, the client falls back to
`postgresql://postgres:postgres@localhost:5433/naira_hbar_checkout`.

## Commands

Run these from `packages/storage`:

```bash
pnpm db:push      # apply src/schema to the database
pnpm db:generate  # generate SQL migrations into ./drizzle
pnpm db:migrate   # run the generated migrations
pnpm build        # build the package with tsdown
```
