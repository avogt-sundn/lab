# Lab Domain

## Purpose

Standalone modules that prove technology characteristics under strict, reproducible conditions. Each subfolder is one proof — a self-contained experiment with deterministic setup, controlled variables, and measured output. Results are printed to stdout.

## Bounded Context

No business logic. No API surface. No Traefik routing. Lab services are one-shot containers invoked via `make lab-*` targets. They do not participate in the main stack lifecycle (`make up`, `APP_SERVICES`, `build-changed`).

## Glossary

_No glossary terms defined yet. Add entries here before using German identifiers in code ([CLAUDE-14])._

## Services

| Service | Technology | Notes |
|---|---|---|
| `postgres-lab` | PostgreSQL 18 | Shared database for all proofs; `wal_level=logical` required by Debezium |
| `kafka-lab` | Apache Kafka 3.9 (KRaft) | Single-node broker; no Zookeeper; used by Debezium CDC proof only |
| `debezium-connect-lab` | Debezium Connect 3.1 | Kafka Connect worker with PostgreSQL connector; CDC proof only |
| `proof-bigint-vs-uuid` | psql (postgres:18-alpine) | Runs `bigint-vs-uuid/proof.sql` and exits |
| `proof-debezium-cdc` | Python 3.13 | Inserts rows, polls Kafka, measures latency; exits |
| `elasticsearch-lab-bulk` | Elasticsearch 9.2 | Single-node ES instance for bulk-index-latency proof only |
| `indexer-jvm` | Quarkus 3.32 (JVM) | Exposes `POST /reindex` for bulk-index-latency proof; port 8080 |
| `indexer-native` | Quarkus 3.32 (GraalVM native) | Same as indexer-jvm, AOT-compiled; port 8081 |
| `proof-bulk-index-latency` | Python 3.13 | Seeds PG, calls both indexers, measures latency; exits |
| `pizzai-web` | nginx:alpine | Serves `index.html` static app on port 8091; no backend |

## Proofs

| Proof | Question | Make target | Runtime |
|---|---|---|---|
| `bigint-vs-uuid` | Which PK type is fastest: BIGINT, UUIDv4, or UUIDv7? | `make lab-bigint-vs-uuid` | ~3 min |
| `debezium-cdc` | What is the end-to-end CDC latency (insert → Kafka event) for batch sizes 1/10/100/1 000? | `make lab-debezium-cdc` | ~10 min |
| `bulk-index-latency` | How does ES bulk-indexing latency vary by batch size, strategy, and JVM vs Native Quarkus? | `make lab-bulk-index-latency` | ~25 min (incl. native build) |
| `browser-llm` | Can a quantized LLM run entirely in a browser via WebGPU with no server-side inference? | `make browser-llm` | ~30 s build + ~30 s model load (model cached after first visit) |

## Lab Conditions

Every proof must:
- Use deterministic data generation (no `random()`, no `gen_random_uuid()` for seed data)
- Disable parallel query execution for reproducible single-threaded timings
- Run each measurement N=10 times in both forward and reverse order to cancel cache-warming bias
- Report raw measurements (min/avg/max) and derived metrics (buffer hits, buffer reads, table/index sizes)
