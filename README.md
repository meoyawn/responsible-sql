# ResponsibleSQL

**Typed raw SQL** described in YAML, compiled to dialect-specific SQL, with optional TypeScript (SQLite) client generation and SQLite query-plan linting.

The idea is to keep SQL as plain text (not an ORM query builder), while still having **named, checkable types** for parameters and row shapes—similar in spirit to SQLDelight or sqlc, but driven by small YAML files instead of `.sql` sources.

## What it does

1. **Parse** YAML query definitions with a small `responsibleSQL` header (version + `sqlite` or `postgres`).
2. **Resolve** reusable row types via a custom tag (`!type`) and expand helpers like `${result}` in `SELECT` text into concrete column lists.
3. **Render** dialect-specific SQL (SQLite path is implemented; PostgreSQL rendering is still a stub).
4. **Generate** typed helpers—today, TypeScript for SQLite (`better-sqlite3`-style `prepareCached` / `run` / `get` / `all`); Kotlin + Vert.x for Postgres is scaffolded but not implemented.
5. **`explain`** (SQLite): run `EXPLAIN QUERY PLAN` against a database and warn on plan patterns that often mean trouble (full scans, correlated subqueries, temp B-trees, etc.).

## YAML shape (conceptual)

- Top-level `responsibleSQL` holds `version` and `dialect`.
- Keys prefixed with `!type` define named structs (field → type string, e.g. `INTEGER`, `TEXT`; optional fields can use a `?` suffix on the name).
- Other keys are **queries**, using one of:
  - **`insert`**: table fragment, `params` as fields, optional `result` / `"${params}"` for `RETURNING`-style output (see `src/dialects/common.ts`).
  - **`exec`**: arbitrary SQL, optional `params` / `result`.
  - **`one`** / **`many`**: a `SELECT` / `WITH` string, optional `params`, required `result` (inline object, type name, or tuple of columns).

The compiler is implemented in `src/compile.ts`; SQLite SQL rendering lives under `src/dialects/`.

## CLI

The CLI is wired in `src/commands.ts` (package `description`: **Typed raw SQL**). Commands:

| Command | Role |
|--------|------|
| `generate` | Walk a directory for `.yaml` / `.yml`, compile each file, print generated code for the chosen `--language`. |
| `explain` | Compile each YAML file and run SQLite `EXPLAIN QUERY PLAN` for every query against `--database`. Optional `--watch` re-runs on file changes. |

**Note:** Default paths in the CLI options point at another local project; override `--dir` and `--database` for your setup. PostgreSQL + `kotlin-vertx` generation is not finished yet—the code throws until those paths are implemented.

## Development

- **Runtime:** [Bun](https://bun.sh) (see `Taskfile.yaml`: `task build` → `bun build`).
- **Language:** TypeScript (strict), validation with [Valibot](https://valibot.dev/), YAML with [yaml](https://eemeli.org/yaml/), CLI with [Commander](https://github.com/tj/commander.js).
- **Tests:** [Vitest](https://vitest.dev/) (`src/*.test.ts`).

`package.json` lists `"main": "dist/index.js"`, but there is no library entry `src/index.ts` yet—the useful surface today is the compiler (`compileYAML`) and the CLI.

## Status

This repository reads like an **early experiment**: PostgreSQL dialect output and Kotlin codegen are TODOs, the TypeScript emitter assumes a `SQLiteConn` with `prepareCached`, and the CLI defaults are developer-machine-specific. The core YAML model and SQLite pipeline are the most complete pieces.

If you extend it, a natural direction is finishing `renderPostgres` / `genPostgresKotlinVertx`, tightening the TS types (optional fields → `| null`), and publishing a small programmatic API from `compile.ts` behind a proper `src/index.ts`.
