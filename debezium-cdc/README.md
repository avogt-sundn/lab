# Debezium CDC Latency Proof

**Question:** What is the end-to-end latency from a PostgreSQL INSERT commit to the Kafka event arriving, and how does batch size affect it?

## Method

- Insert N rows in one transaction; record wall-clock time immediately after `COMMIT`.
- Poll the Kafka topic until all N `op:"c"` events arrive; record wall-clock time of last event.
- **Latency** = time of last Kafka event − time of PG commit.
- Batch sizes: **1 / 10 / 100 / 1 000** rows × 10 iterations, run forward then reversed (cancel cache-warming bias) → 20 samples per batch size.

## Stack

| Component | Image |
|---|---|
| PostgreSQL 18 | `postgres:18-alpine` with `wal_level=logical` |
| Kafka (KRaft) | `apache/kafka:3.9.0` |
| Debezium Connect | `quay.io/debezium/connect:3.1` |
| Connector | `io.debezium.connector.postgresql.PostgresConnector` via `pgoutput` plugin |

Consumer uses manual partition `assign()` + `seek()` to avoid group-rebalancing overhead between iterations.

## Results (Docker, single-node, local machine)

```
  Batch size     N       min       avg       max     stdev
  ------------  ----  --------  --------  --------  --------
             1    20      48.7      56.3      67.5       4.9  ms
            10    20      45.5      52.6      59.6       3.5  ms
           100    20       9.2      36.4     102.1      21.6  ms
          1000    20      76.6     103.5     140.2      19.2  ms
```

### Findings

- **Small batches (1–10 rows):** ~50–56 ms average. Dominated by Debezium's internal polling interval (100 ms configured, ~50 ms average wait). Variance is low and stable.
- **Medium batches (100 rows):** Lower average (36 ms) because the last event of a large transaction arrives soon after the first — Debezium can deliver the whole batch in one internal poll cycle. High stdev (21 ms) reflects variability in when the poll cycle aligns with the commit.
- **Large batches (1 000 rows):** 103 ms average. Serialization overhead becomes visible — Debezium still polls the same internal cycle but the last event arrives later due to WAL read + Kafka produce time for 1 k records.

**Practical conclusion:** Debezium CDC latency in this setup is bounded by `poll.interval.ms` (100 ms) for small writes and by serialization throughput for large ones. Sub-100 ms end-to-end is achievable for typical OLTP write sizes.

## Run

```bash
make lab-debezium-cdc
```

Builds the proof image, starts `postgres-lab`, `kafka-lab`, and `debezium-connect-lab`, runs the proof to completion, then stops `kafka-lab` and `debezium-connect-lab`. `postgres-lab` is shared with other lab proofs and stays running.

## Files

| File | Purpose |
|---|---|
| `proof.py` | Measurement script |
| `Dockerfile` | Python 3.13-slim + psycopg2 + confluent-kafka |
| `docker-compose.yaml` | `kafka-lab`, `debezium-connect-lab`, `proof-debezium-cdc` services |
