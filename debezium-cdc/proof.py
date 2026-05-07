"""
Debezium CDC latency proof.

Question: What is the end-to-end latency (insert → Kafka event) for Debezium
         streaming changes from PostgreSQL, and how does batch size affect it?

Method:
  - Insert N rows in one transaction, record the wall-clock time immediately after commit.
  - Poll the Kafka topic until all N events arrive; record wall-clock time of last event.
  - Latency = time_of_last_kafka_event - time_of_pg_commit
  - Repeat for batch sizes [1, 10, 100, 1 000] × 10 iterations (forward + reverse order).
  - Single reusable consumer with manual partition assignment (no group rebalancing).
"""

import json
import os
import sys
import time
import statistics
import datetime
import requests
import psycopg2
from confluent_kafka import Consumer, KafkaException, TopicPartition

# ── Config ────────────────────────────────────────────────────────────────────
PG_HOST     = os.environ["PGHOST"]
PG_USER     = os.environ["PGUSER"]
PG_PASSWORD = os.environ["PGPASSWORD"]
PG_DATABASE = os.environ["PGDATABASE"]
CONNECT_URL = os.environ["CONNECT_URL"]
KAFKA_BROKER= os.environ["KAFKA_BROKER"]
TOPIC       = "lab.public.cdc_events"
CONNECTOR   = "lab-postgres-source"
SLOT        = "lab_cdc_slot"
ITERATIONS  = 10
BATCH_SIZES = [1, 10, 100, 1_000]
POLL_TIMEOUT_S = 60

# ── Helpers ───────────────────────────────────────────────────────────────────
def banner(text):
    w = 68
    print(f"\n╔{'═' * w}╗")
    print(f"║  {text:<{w-2}}║")
    print(f"╚{'═' * w}╝")

def section(text):
    print(f"\n── {text} {'─' * max(0, 65 - len(text))}")

def wait_for_connect(timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{CONNECT_URL}/connectors", timeout=5)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(3)
    sys.exit("ERROR: Debezium Connect did not become ready in time")

def delete_connector_and_slot(pg_conn):
    """Stop the connector and drop the replication slot so we start clean."""
    requests.delete(f"{CONNECT_URL}/connectors/{CONNECTOR}")
    # Wait until the slot is gone (connector released it)
    deadline = time.time() + 30
    cur = pg_conn.cursor()
    while time.time() < deadline:
        cur.execute("SELECT 1 FROM pg_replication_slots WHERE slot_name = %s", (SLOT,))
        if cur.fetchone() is None:
            cur.close()
            return
        time.sleep(1)
    # Force-drop if still held (shouldn't happen in normal flow)
    try:
        cur.execute("SELECT pg_drop_replication_slot(%s)", (SLOT,))
        pg_conn.commit()
    except Exception:
        pg_conn.rollback()
    cur.close()

def register_connector():
    config = {
        "name": CONNECTOR,
        "config": {
            "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
            "database.hostname": PG_HOST,
            "database.port": "5432",
            "database.user": PG_USER,
            "database.password": PG_PASSWORD,
            "database.dbname": PG_DATABASE,
            "topic.prefix": "lab",
            "table.include.list": "public.cdc_events",
            "plugin.name": "pgoutput",
            "publication.autocreate.mode": "filtered",
            "slot.name": SLOT,
            "heartbeat.interval.ms": "500",
            "max.batch.size": "1",
            "poll.interval.ms": "100",
        },
    }
    r = requests.post(
        f"{CONNECT_URL}/connectors",
        headers={"Content-Type": "application/json"},
        data=json.dumps(config),
        timeout=10,
    )
    if r.status_code not in (200, 201):
        sys.exit(f"ERROR: connector registration failed: {r.status_code} {r.text}")

def wait_for_connector_running(timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{CONNECT_URL}/connectors/{CONNECTOR}/status", timeout=5)
            if r.status_code == 200:
                status = r.json()["connector"]["state"]
                if status == "RUNNING":
                    return
        except Exception:
            pass
        time.sleep(2)
    sys.exit("ERROR: connector did not reach RUNNING state")

def wait_for_topic(consumer, topic, timeout=60):
    """Block until the topic partition 0 exists and is assignable."""
    tp = TopicPartition(topic, 0)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            meta = consumer.list_topics(topic, timeout=5)
            if topic in meta.topics and not meta.topics[topic].error:
                consumer.assign([tp])
                consumer.get_watermark_offsets(tp, timeout=5)
                return tp
        except Exception:
            pass
        time.sleep(2)
    sys.exit(f"ERROR: topic {topic} did not appear within {timeout}s")

def pg_connect():
    return psycopg2.connect(
        host=PG_HOST, user=PG_USER, password=PG_PASSWORD, dbname=PG_DATABASE
    )

def setup_table(cur):
    cur.execute("DROP TABLE IF EXISTS cdc_events")
    cur.execute("""
        CREATE TABLE cdc_events (
            id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            batch_id   INT    NOT NULL,
            payload    TEXT   NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

def insert_batch(cur, batch_id, size):
    rows = [(batch_id, f"row-{i:08d}") for i in range(size)]
    cur.executemany(
        "INSERT INTO cdc_events (batch_id, payload) VALUES (%s, %s)",
        rows,
    )

def seek_to_end(consumer, tp):
    """Seek consumer to the current high-watermark so only new messages are seen."""
    _low, high = consumer.get_watermark_offsets(tp, timeout=10)
    tp.offset = high
    consumer.seek(tp)

def collect_events(consumer, tp, expected_count, timeout_s):
    """Poll for `expected_count` INSERT events; returns (last_wall_time, count_received)."""
    received = 0
    last_ts = None
    deadline = time.time() + timeout_s
    while received < expected_count and time.time() < deadline:
        msg = consumer.poll(timeout=0.05)
        if msg is None:
            continue
        if msg.error():
            raise KafkaException(msg.error())
        val = json.loads(msg.value())
        op = val.get("payload", {}).get("op")
        if op == "c":
            received += 1
            last_ts = time.time()
    return last_ts, received

# ── Main ──────────────────────────────────────────────────────────────────────
banner("Debezium CDC Latency Proof")
print(f"  Connect:  {CONNECT_URL}")
print(f"  Broker:   {KAFKA_BROKER}")
print(f"  Topic:    {TOPIC}")
print(f"  Batches:  {BATCH_SIZES}  × {ITERATIONS} iterations (fwd+rev)")

section("1 · Waiting for Debezium Connect")
wait_for_connect()
print("  Connect ready")

section("2 · Cleanup: stop stale connector + drop replication slot")
conn = pg_connect()
conn.autocommit = True
delete_connector_and_slot(conn)
conn.autocommit = False
print("  Connector and slot cleared")

section("3 · Creating source table")
cur = conn.cursor()
cur.execute("SHOW wal_level")
wal_level = cur.fetchone()[0]
print(f"  wal_level = {wal_level}")
if wal_level != "logical":
    conn.close()
    sys.exit(f"ERROR: wal_level must be 'logical', got '{wal_level}'.")
setup_table(cur)
conn.commit()
print("  Table cdc_events created")

section("4 · Registering connector")
register_connector()
wait_for_connector_running()
print(f"  Connector '{CONNECTOR}' is RUNNING")

section("5 · Waiting for topic partition")
consumer = Consumer({
    "bootstrap.servers": KAFKA_BROKER,
    "group.id": f"lab-proof-{int(time.time())}",
    "enable.auto.commit": "false",
})
tp = wait_for_topic(consumer, TOPIC)
print(f"  Topic {TOPIC} ready")

# Allow connector to reach steady state and finish snapshot (empty table → fast)
time.sleep(3)

section("6 · Measuring latency")
results = {bs: [] for bs in BATCH_SIZES}
batch_counter = 0

# Iterate sizes forward then reverse to cancel cache-warming bias
ordered_sizes = BATCH_SIZES + list(reversed(BATCH_SIZES))

for iteration in range(ITERATIONS):
    for batch_size in ordered_sizes:
        seek_to_end(consumer, tp)

        insert_batch(cur, batch_counter, batch_size)
        t_commit = time.time()
        conn.commit()
        batch_counter += 1

        last_ts, received = collect_events(consumer, tp, batch_size, POLL_TIMEOUT_S)

        if received < batch_size:
            print(f"  WARN: bs={batch_size} iter={iteration}: "
                  f"only {received}/{batch_size} events within {POLL_TIMEOUT_S}s")
            latency = None
        else:
            latency = last_ts - t_commit

        if latency is not None:
            results[batch_size].append(latency * 1000)

        label = f"  bs={batch_size:5d}  iter={iteration+1:2d}  "
        label += f"lat={latency*1000:7.1f} ms" if latency else "lat=TIMEOUT"
        print(label)

consumer.close()
cur.close()
conn.close()

# ── Report ────────────────────────────────────────────────────────────────────
banner("Results — CDC Latency (ms)")
print(f"\n  {'Batch size':>12}  {'N':>4}  {'min':>8}  {'avg':>8}  {'max':>8}  {'stdev':>8}")
print(f"  {'-'*12}  {'-'*4}  {'-'*8}  {'-'*8}  {'-'*8}  {'-'*8}")

summary = {}
for bs in BATCH_SIZES:
    vals = results[bs]
    if len(vals) < 2:
        print(f"  {bs:>12}  {'—':>4}  (insufficient data)")
        continue
    mn  = min(vals)
    avg = statistics.mean(vals)
    mx  = max(vals)
    sd  = statistics.stdev(vals)
    print(f"  {bs:>12}  {len(vals):>4}  {mn:>8.1f}  {avg:>8.1f}  {mx:>8.1f}  {sd:>8.1f}")
    summary[bs] = {"n": len(vals), "min_ms": round(mn,1), "avg_ms": round(avg,1),
                   "max_ms": round(mx,1), "stdev_ms": round(sd,1)}

banner("JSON Summary")
print(json.dumps({
    "proof": "debezium-cdc",
    "run_at": datetime.datetime.utcnow().isoformat() + "Z",
    "iterations": ITERATIONS,
    "batch_sizes": BATCH_SIZES,
    "latency_ms": summary,
}, indent=2))

banner("Done")
