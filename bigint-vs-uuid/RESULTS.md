# Benchmark Results: BIGINT vs. UUIDv4 vs. UUIDv7 as Primary Key

**PostgreSQL:** 18-alpine  
**Dataset:** 1,000,000 parent rows + 5,000,000 child rows per variant (20M rows total, incl. split-identity tables)  
**Environment:** Single-thread (`max_parallel_workers_per_gather = 0`), `work_mem = 256MB`  
**Methodology:** 10 iterations × 2 orderings (forward + reverse) = 20 samples per cell, averaged to eliminate cache-warming bias

---

## Query Performance

After the first warm-up pass all queries were served entirely from the shared buffer cache (`avg_reads = 0` throughout). All times in milliseconds.

| Test | BIGINT | UUIDv4 | UUIDv7 |
|---|---|---|---|
| PK lookup — avg ms | 0.015 | **0.013** | 0.016 |
| PK lookup — min / max ms | 0.005 / 0.185 | 0.004 / 0.152 | 0.005 / 0.199 |
| FK join — avg ms | 0.023 | **0.018** | 0.031 |
| FK join — min / max ms | 0.010 / 0.229 | 0.010 / 0.132 | 0.010 / 0.371 |
| Range scan — avg ms | 0.019 | **0.012** | 0.023 |
| Range scan — rows returned | **101** | **0** | **101** |

> **Range scan finding:** `BETWEEN lo AND hi` on UUIDv4 returned **0 rows**. MD5-based UUIDs are lexicographically unordered — `md5('400000')::uuid` has no sequential relationship to `md5('400100')::uuid`, so the range is effectively empty. The lower `avg_ms` for UUIDv4 is an artifact of the empty result, not a real performance advantage. BIGINT and UUIDv7 each return the expected 101 rows and scan contiguous B-tree leaf pages.

---

## Insert Throughput (100,000 rows, unindexed bench tables)

| Variant | Time (ms) | Rows / sec |
|---|---|---|
| BIGINT | **34 ms** | ~2,943,000/s |
| UUIDv4 | 103 ms | ~971,000/s |
| UUIDv7 | 248 ms | ~403,000/s |

> UUIDv4 is 3× slower than BIGINT for bulk inserts because random insertion order causes B-tree page splits. UUIDv7 is slowest here because `lab_uuidv7()` is a PL/pgSQL function with per-row overhead — a native implementation (PostgreSQL 17+ `gen_uuid_v7()` or the `pg_uuidv7` extension) would close most of this gap.

---

## Storage

### Parent tables (1M rows each)

| Table | Data | Indexes | Total |
|---|---|---|---|
| `parent_bigint` | 57 MB | 21 MB | **79 MB** |
| `parent_bigint_ext` *(BIGINT PK + UUID col)* | 73 MB | 52 MB | 125 MB (+58%) |
| `parent_uuidv4` | 65 MB | 38 MB | 103 MB (+30%) |
| `parent_uuidv7` | 65 MB | 30 MB | 95 MB (+20%) |

> `parent_bigint_ext` carries two indexes (BIGINT PK + UUID UNIQUE), which is why its index footprint (52 MB) exceeds both pure-UUID variants. The +16 MB data cost is the UUID column itself (1M × 16 bytes).

### Child tables (5M rows each, with FK index)

| Table | Data | Indexes | Total |
|---|---|---|---|
| `child_bigint` | 326 MB | 193 MB | **519 MB** |
| `child_bigint_ext` *(BIGINT FK — no UUID propagation)* | 326 MB | 193 MB | **519 MB** |
| `child_uuidv4` | 558 MB | 273 MB | 831 MB (+60%) |
| `child_uuidv7` | 403 MB | 301 MB | 704 MB (+36%) |

> Child tables in the split-identity pattern are byte-for-byte identical to plain BIGINT — the UUID column does not propagate to FK children.

### System totals (parent + all children)

| Pattern | Total | vs. BIGINT |
|---|---|---|
| BIGINT | 598 MB | — |
| **BIGINT + UUID col (split-identity)** | **644 MB** | **+8%** |
| UUIDv7 | 799 MB | +34% |
| UUIDv4 | 934 MB | +56% |

---

## Split-Identity Lookup: BIGINT PK vs. UUID Column

Schema: `parent_bigint_ext(id BIGINT PK, public_id UUID UNIQUE, ...)` — children FK on BIGINT only.

| Test | Avg ms | Min ms | Max ms | Buf Hits |
|---|---|---|---|---|
| `ext_pk_lookup` — direct BIGINT PK | **0.006** | 0.005 | 0.011 | 4 |
| `ext_uuid_lookup` — via UUID unique index | 0.007 | 0.005 | 0.021 | 4 |
| `ext_join_via_uuid` — UUID → parent + BIGINT FK join | 0.017 | 0.011 | 0.096 | 12 |

**Findings:**

- The UUID index hop adds **~0.001 ms** (~1 µs) over a direct BIGINT lookup — within measurement noise at this scale.
- Buffer hits are identical (4) for both single-row lookups: one index page + one heap page either way.
- `ext_join_via_uuid` hits 12 buffer pages, identical to a regular `fk_join` on any other variant — the UUID-to-BIGINT resolution is absorbed into the same index nested-loop plan.

---

## Summary

| Criterion | Winner | Note |
|---|---|---|
| PK lookup | all ≈ equal | Sub-microsecond differences — measurement noise |
| FK join | all ≈ equal | Index nested loop at equal tree depth |
| Range scan — correctness | BIGINT, UUIDv7 | UUIDv4 `BETWEEN` returns 0 rows — semantically broken |
| Range scan — speed | BIGINT ≈ UUIDv7 | Contiguous leaf-page scan; UUIDv4 "wins" only via empty range |
| Insert throughput | BIGINT | 3× faster than UUIDv4; UUIDv7 gap is largely implementation overhead |
| Storage — parent | BIGINT | Smallest; split-identity adds one UUID index (+58%) but is still competitive |
| Storage — child | BIGINT = split-identity | UUID column does not propagate to FK children |
| Storage — system total | BIGINT | Split-identity (+8%) vs. UUIDv7 (+34%) vs. UUIDv4 (+56%) |
| UUID lookup overhead | split-identity | +1 µs vs. direct BIGINT PK — negligible |

### Conclusions

**Cache-warm point-query latency is identical across all variants.** The meaningful differences are:

1. **UUIDv4 range queries are broken.** `BETWEEN` on random UUIDs silently returns 0 rows unless both bounds happen to be neighbours in UUID space. Keyset pagination (`WHERE id > last_seen`) and any time-range-like query pattern are unsafe with UUIDv4.

2. **The storage cost factor is significant at scale.** The 36–60% child-table overhead is not just the 8 extra bytes of the key — it is that width propagating into every FK index, multiplied by B-tree page fragmentation from random insertion order.

3. **UUIDv7 fixes both problems** (point 1 fully, the fragmentation component of point 2) at the cost of only the 8-byte width penalty. It is the right UUID choice when cross-system uniqueness is required.

4. **BIGINT remains optimal** for storage and write throughput when surrogate keys without cross-system uniqueness requirements are sufficient.

5. **The split-identity pattern (BIGINT PK + UUID lookup column) is the best of both worlds** when an API must expose non-guessable IDs. The UUID index hop costs ~1 µs and the join plan is identical to a pure BIGINT join. The only real cost is the extra UUID index on the root table (+46 MB per 1M rows); child tables stay at BIGINT cost — making the system total only **8% larger** than pure BIGINT, versus 34–56% for pure UUID schemas.
