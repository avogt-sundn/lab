"""
Bulk index latency proof.

Question: How does bulk-indexing latency (Postgres → Elasticsearch) vary across
          batch sizes, indexing strategies, and JVM vs Native Quarkus runtime?

Method:
  - Seed postgres-lab with 100,000 deterministic partner records (seed=42, COPY format).
  - For each variant (jvm-sequential, jvm-parallel, native-sequential):
      - Issue 2 warmup calls (not measured) to stabilize JIT caches.
      - Run batch sizes [500, 1000, 2000, 5000] forward then reverse × 10 iterations.
      - Record client-side wall-clock time and server-reported durationMs per call.
  - Report min/avg/max/stdev per (variant, batchSize).
"""

import datetime
import io
import json
import os
import statistics
import sys
import time

import psycopg2
import requests

# ── Config ─────────────────────────────────────────────────────────────────────
PG_HOST      = os.environ["PGHOST"]
PG_USER      = os.environ["PGUSER"]
PG_PASSWORD  = os.environ["PGPASSWORD"]
PG_DATABASE  = os.environ["PGDATABASE"]
JVM_URL      = os.environ["INDEXER_JVM_URL"]
NATIVE_URL   = os.environ["INDEXER_NATIVE_URL"]

ITERATIONS   = 10
BATCH_SIZES  = [500, 1_000, 2_000, 5_000]
SEED_ROWS    = 100_000
WARMUP_CALLS = 2

CITIES  = ["Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
           "Düsseldorf", "Leipzig", "Dortmund", "Bremen"]
NAMES   = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Wagner",
           "Becker", "Schulz", "Hoffmann", "Schäfer"]
STREETS = ["Hauptstraße", "Bahnhofstraße", "Gartenweg", "Schulstraße",
           "Bergstraße", "Dorfstraße", "Kirchgasse", "Lindenweg",
           "Mozartstraße", "Beethovenstraße"]

# ── Helpers ────────────────────────────────────────────────────────────────────
def banner(text):
    w = 68
    print(f"\n╔{'═' * w}╗")
    print(f"║  {text:<{w-2}}║")
    print(f"╚{'═' * w}╝")

def section(text):
    print(f"\n── {text} {'─' * max(0, 65 - len(text))}")

def pg_connect():
    return psycopg2.connect(
        host=PG_HOST, user=PG_USER, password=PG_PASSWORD, dbname=PG_DATABASE
    )

def wait_for_url(url, label, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(f"{url}/q/health", timeout=5)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(3)
    sys.exit(f"ERROR: {label} at {url} did not become ready in time")

def seed_partners(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS partner (
            id             BIGSERIAL PRIMARY KEY,
            partner_number BIGINT NOT NULL,
            alpha_code     VARCHAR(10),
            name1          VARCHAR(100),
            name2          VARCHAR(100),
            name3          VARCHAR(100),
            firstname      VARCHAR(100),
            street         VARCHAR(100),
            house_number   VARCHAR(10),
            postal_code    VARCHAR(10),
            city           VARCHAR(100),
            type           VARCHAR(20),
            group_type     VARCHAR(20),
            group_number   BIGINT
        )
    """)
    cur.execute("SELECT COUNT(*) FROM partner")
    count = cur.fetchone()[0]
    if count >= SEED_ROWS:
        print(f"  partner table already has {count} rows — skipping seed.")
        cur.close()
        conn.commit()
        return

    print(f"  Seeding {SEED_ROWS} deterministic partner rows via COPY...")
    buf = io.StringIO()
    types = ["P", "O", "C"]
    for i in range(SEED_ROWS):
        pn      = 1_000_000 + i
        alpha   = f"P{i:07d}"
        name1   = NAMES[i % len(NAMES)]
        name2   = NAMES[(i * 3) % len(NAMES)]
        name3   = ""
        first   = NAMES[(i * 7) % len(NAMES)]
        street  = STREETS[i % len(STREETS)]
        house   = str((i % 200) + 1)
        postal  = f"{10000 + (i % 90000):05d}"
        city    = CITIES[i % len(CITIES)]
        typ     = types[i % len(types)]
        gtype   = "A" if i % 3 == 0 else "B"
        gnum    = i // 100

        def esc(v):
            return v if v else r"\N"

        buf.write(f"{pn}\t{alpha}\t{name1}\t{name2}\t{esc(name3)}\t"
                  f"{first}\t{street}\t{house}\t{postal}\t{city}\t"
                  f"{typ}\t{gtype}\t{gnum}\n")

    buf.seek(0)
    cur.copy_from(buf, "partner",
                  columns=("partner_number", "alpha_code", "name1", "name2", "name3",
                            "firstname", "street", "house_number", "postal_code",
                            "city", "type", "group_type", "group_number"))
    conn.commit()
    cur.close()
    print(f"  Seeded {SEED_ROWS} rows.")

def call_reindex(base_url, batch_size, strategy, timeout=300):
    t0 = time.time()
    r = requests.post(
        f"{base_url}/reindex",
        params={"batchSize": batch_size, "strategy": strategy},
        timeout=timeout,
    )
    client_ms = (time.time() - t0) * 1000
    r.raise_for_status()
    body = r.json()
    server_ms = body["durationMs"]
    return client_ms, server_ms, body["documentsIndexed"]

# ── Main ───────────────────────────────────────────────────────────────────────
banner("Bulk Index Latency Proof")
print(f"  JVM indexer:    {JVM_URL}")
print(f"  Native indexer: {NATIVE_URL}")
print(f"  Batch sizes:    {BATCH_SIZES}")
print(f"  Iterations:     {ITERATIONS} × (fwd + rev) = {ITERATIONS * 2 * len(BATCH_SIZES)} calls per variant")

section("1 · Seed postgres-lab")
conn = pg_connect()
seed_partners(conn)
conn.close()

section("2 · Verify indexers are up")
wait_for_url(JVM_URL, "indexer-jvm")
print("  indexer-jvm ready")
wait_for_url(NATIVE_URL, "indexer-native")
print("  indexer-native ready")

# ── Variants ───────────────────────────────────────────────────────────────────
VARIANTS = [
    ("jvm-sequential",    JVM_URL,    "sequential"),
    ("jvm-parallel",      JVM_URL,    "parallel"),
    ("native-sequential", NATIVE_URL, "sequential"),
]

# results[variant][batch_size] = {"client": [...], "server": [...]}
results = {
    v[0]: {bs: {"client": [], "server": []} for bs in BATCH_SIZES}
    for v in VARIANTS
}

ordered_sizes = BATCH_SIZES + list(reversed(BATCH_SIZES))

for variant_name, url, strategy in VARIANTS:
    section(f"3 · Warmup — {variant_name}")
    for _ in range(WARMUP_CALLS):
        client_ms, server_ms, docs = call_reindex(url, 1_000, strategy)
        print(f"  warmup  docs={docs}  server={server_ms:.0f}ms  client={client_ms:.0f}ms")

    section(f"4 · Measuring — {variant_name}")
    for iteration in range(ITERATIONS):
        for batch_size in ordered_sizes:
            client_ms, server_ms, docs = call_reindex(url, batch_size, strategy)
            results[variant_name][batch_size]["client"].append(client_ms)
            results[variant_name][batch_size]["server"].append(server_ms)
            print(f"  {variant_name:<22}  bs={batch_size:5d}  iter={iteration+1:2d}"
                  f"  server={server_ms:7.0f}ms  client={client_ms:7.0f}ms  docs={docs}")

# ── Report ─────────────────────────────────────────────────────────────────────
banner("Results — Server-reported indexing time (ms)")
hdr = f"  {'Variant':<22}  {'Batch':>5}  {'N':>3}  {'min':>7}  {'avg':>7}  {'max':>7}  {'stdev':>7}"
print(hdr)
print(f"  {'-'*22}  {'-'*5}  {'-'*3}  {'-'*7}  {'-'*7}  {'-'*7}  {'-'*7}")

summary = {}
for variant_name, _, _ in VARIANTS:
    summary[variant_name] = {}
    for bs in BATCH_SIZES:
        vals = results[variant_name][bs]["server"]
        n   = len(vals)
        mn  = min(vals)
        avg = statistics.mean(vals)
        mx  = max(vals)
        sd  = statistics.stdev(vals) if n > 1 else 0.0
        print(f"  {variant_name:<22}  {bs:>5}  {n:>3}  {mn:>7.0f}  {avg:>7.0f}  {mx:>7.0f}  {sd:>7.0f}")
        summary[variant_name][bs] = {
            "n": n, "min_ms": round(mn), "avg_ms": round(avg),
            "max_ms": round(mx), "stdev_ms": round(sd),
        }

banner("JSON Summary")
print(json.dumps({
    "proof": "bulk-index-latency",
    "run_at": datetime.datetime.utcnow().isoformat() + "Z",
    "seed_rows": SEED_ROWS,
    "iterations": ITERATIONS,
    "batch_sizes": BATCH_SIZES,
    "variants": [v[0] for v in VARIANTS],
    "server_latency_ms": summary,
}, indent=2))

banner("Done")
