# Lab Domain

## Purpose

Standalone modules that prove technology characteristics under strict, reproducible conditions. Each subfolder is one proof — a self-contained experiment with deterministic setup, controlled variables, and measured output. Results are printed to stdout.

## Bounded Context

No business logic. No API surface. No Traefik routing. Lab services are one-shot containers invoked via `make lab-*` targets. They do not participate in the main stack lifecycle (`make up`, `APP_SERVICES`, `build-changed`).

## Services

| Service | Technology | Notes |
|---|---|---|
| `postgres-lab` | PostgreSQL 18 | Shared database for all proofs; data persisted in `pg-lab-data` volume |
| `proof-bigint-vs-uuid` | psql (postgres:15-alpine) | Runs `bigint-vs-uuid/proof.sql` and exits |

## Proofs

| Proof | Question | Make target | Runtime |
|---|---|---|---|
| `bigint-vs-uuid` | Which PK type is fastest: BIGINT, UUIDv4, or UUIDv7? | `make lab-bigint-vs-uuid` | ~3 min |

## Lab Conditions

Every proof must:
- Use deterministic data generation (no `random()`, no `gen_random_uuid()` for seed data)
- Disable parallel query execution for reproducible single-threaded timings
- Run each measurement N=10 times in both forward and reverse order to cancel cache-warming bias
- Report raw measurements (min/avg/max) and derived metrics (buffer hits, buffer reads, table/index sizes)
