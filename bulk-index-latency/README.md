# Bulk Index Latency Proof

**Question:** How does Elasticsearch bulk-indexing latency vary across batch sizes, indexing strategies, and JVM vs Native Quarkus runtime?

## Method

- Seed `postgres-lab` with 100,000 deterministic partner records (fixed data, seed=42 equivalent via modular offsets — no `random()`)
- Run each `(variant, batchSize)` combination 10× forward + 10× reverse = 20 samples
- 2 warmup calls per variant before measurement (stabilises JIT and ES segment caches)
- ES `refresh_interval` set to `-1` during each reindex call, restored to `1s` and force-flushed after
- All calls are sequential — no concurrent indexers

## Stack

| Component | Image |
|---|---|
| Elasticsearch 9.2 | `docker.elastic.co/elasticsearch/elasticsearch:9.2.2` |
| PostgreSQL 18 | `postgres:18-alpine` (shared `postgres-lab`) |
| Indexer JVM | Custom Quarkus 3.32 app — `eclipse-temurin:21-jre-alpine` |
| Indexer Native | Custom Quarkus 3.32 app — GraalVM native via `quarkus-mandrel-builder-image:jdk-21` |
| Orchestrator | `python:3.13-slim` |

## Variants

| Variant | Runtime | Strategy | Description |
|---|---|---|---|
| `jvm-sequential` | HotSpot JVM | Single-threaded loop | Load page → bulk-index → repeat |
| `jvm-parallel` | HotSpot JVM | Producer + 2 consumers | 1 reader thread feeds a bounded queue; 2 ES writer threads drain it |
| `native-sequential` | GraalVM native (AOT) | Single-threaded loop | Same logic as `jvm-sequential`, compiled to native binary |

## Results

_Run `make lab-bulk-index-latency` to populate this section._

### Server-reported indexing time (ms) — 100k documents

| Variant | Batch | N | min | avg | max | stdev |
|---|---|---|---|---|---|---|
| jvm-sequential | 500 | — | — | — | — | — |
| jvm-sequential | 1000 | — | — | — | — | — |
| jvm-sequential | 2000 | — | — | — | — | — |
| jvm-sequential | 5000 | — | — | — | — | — |
| jvm-parallel | 500 | — | — | — | — | — |
| jvm-parallel | 1000 | — | — | — | — | — |
| jvm-parallel | 2000 | — | — | — | — | — |
| jvm-parallel | 5000 | — | — | — | — | — |
| native-sequential | 500 | — | — | — | — | — |
| native-sequential | 1000 | — | — | — | — | — |
| native-sequential | 2000 | — | — | — | — | — |
| native-sequential | 5000 | — | — | — | — | — |

### Findings

_To be filled after first run._

**Expected signals to look for:**

- **Batch size sweet spot**: ES bulk throughput typically peaks around 1,000–5,000 docs/request; smaller batches waste HTTP round-trip overhead.
- **Parallel pipeline gain**: Should reduce wall-clock time by overlapping PG reads with ES writes. Effect is largest when network latency between containers is meaningful.
- **Native vs JVM**: Native eliminates JIT warmup (relevant for the first few calls) but lacks adaptive optimisation for long-running loops. Expect native to win at cold start, JVM to close the gap or overtake after warmup.

## Run

```bash
# Note: native image build takes ~5 min (first time only; BuildKit cache applies on reruns)
make lab-bulk-index-latency
```

## Files

| File | Purpose |
|---|---|
| `proof.py` | Python orchestrator — seeds PG, drives measurements, prints results |
| `Dockerfile` | Orchestrator container image |
| `docker-compose.yaml` | Elasticsearch + indexer-jvm + indexer-native + proof services |
| `indexer/` | Quarkus 3.32 indexer app (shared source, two Docker images) |
| `indexer/Dockerfile.jvm` | JVM build (maven → `eclipse-temurin:21-jre-alpine`) |
| `indexer/Dockerfile.native` | Native build (Mandrel → `quarkus-micro-image:2.0`) |
| `indexer/src/.../ReindexService.java` | Sequential and parallel indexing strategies |
| `indexer/src/.../ReindexResource.java` | `POST /reindex?batchSize=N&strategy=sequential\|parallel` |
