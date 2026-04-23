# Messergebnisse: BIGINT vs. UUIDv4 vs. UUIDv7 als Primärschlüssel

**PostgreSQL:** 18-alpine  
**Datensatz:** 1.000.000 Elternzeilen + 5.000.000 Kindzeilen pro Variante (20 Mio. Zeilen gesamt, inkl. Split-Identity-Tabellen)  
**Umgebung:** Einzelthread (`max_parallel_workers_per_gather = 0`), `work_mem = 256MB`  
**Methodik:** 10 Iterationen × 2 Reihenfolgen (vorwärts + rückwärts) = 20 Messwerte pro Zelle, gemittelt zur Eliminierung von Cache-Warming-Verzerrungen

---

## Abfrageleistung

Nach dem ersten Warmlauf wurden alle Abfragen vollständig aus dem Shared-Buffer-Cache bedient (`avg_reads = 0` durchgehend). Alle Zeiten in Millisekunden.

| Test | BIGINT | UUIDv4 | UUIDv7 |
|---|---|---|---|
| PK-Lookup — Ø ms | 0,015 | **0,013** | 0,016 |
| PK-Lookup — min / max ms | 0,005 / 0,185 | 0,004 / 0,152 | 0,005 / 0,199 |
| FK-Join — Ø ms | 0,023 | **0,018** | 0,031 |
| FK-Join — min / max ms | 0,010 / 0,229 | 0,010 / 0,132 | 0,010 / 0,371 |
| Bereichssuche — Ø ms | 0,019 | **0,012** | 0,023 |
| Bereichssuche — zurückgegebene Zeilen | **101** | **0** | **101** |

> **Befund Bereichssuche:** `BETWEEN lo AND hi` auf UUIDv4 lieferte **0 Zeilen**. MD5-basierte UUIDs sind lexikografisch ungeordnet — `md5('400000')::uuid` hat keinerlei sequenzielles Verhältnis zu `md5('400100')::uuid`, der Bereich ist daher praktisch leer. Der niedrigere `avg_ms`-Wert bei UUIDv4 ist ein Artefakt des leeren Bereichs, kein echter Leistungsvorteil. BIGINT und UUIDv7 liefern erwartungsgemäß jeweils 101 Zeilen und scannen zusammenhängende B-Baum-Blattseiten.

---

## Einfügeleistung (100.000 Zeilen, nicht indizierte Bench-Tabellen)

| Variante | Zeit (ms) | Zeilen / Sek. |
|---|---|---|
| BIGINT | **34 ms** | ~2.943.000/s |
| UUIDv4 | 103 ms | ~971.000/s |
| UUIDv7 | 248 ms | ~403.000/s |

> UUIDv4 ist beim Masseneinfügen 3× langsamer als BIGINT, da die zufällige Einfügereihenfolge B-Baum-Seitenteilungen verursacht. UUIDv7 ist hier am langsamsten, weil `lab_uuidv7()` eine PL/pgSQL-Funktion mit Overhead pro Zeile ist — eine native Implementierung (PostgreSQL 17+ `gen_uuid_v7()` oder die Erweiterung `pg_uuidv7`) würde diesen Unterschied deutlich verringern.

---

## Speicherbedarf

### Elterntabellen (je 1 Mio. Zeilen)

| Tabelle | Daten | Indizes | Gesamt |
|---|---|---|---|
| `parent_bigint` | 57 MB | 21 MB | **79 MB** |
| `parent_bigint_ext` *(BIGINT PK + UUID-Spalte)* | 73 MB | 52 MB | 125 MB (+58 %) |
| `parent_uuidv4` | 65 MB | 38 MB | 103 MB (+30 %) |
| `parent_uuidv7` | 65 MB | 30 MB | 95 MB (+20 %) |

> `parent_bigint_ext` trägt zwei Indizes (BIGINT PK + UUID UNIQUE), weshalb der Index-Fußabdruck (52 MB) beide reinen UUID-Varianten übersteigt. Die +16 MB an Rohdaten entsprechen der UUID-Spalte selbst (1 Mio. × 16 Byte).

### Kindtabellen (je 5 Mio. Zeilen, mit FK-Index)

| Tabelle | Daten | Indizes | Gesamt |
|---|---|---|---|
| `child_bigint` | 326 MB | 193 MB | **519 MB** |
| `child_bigint_ext` *(BIGINT FK — keine UUID-Weitergabe)* | 326 MB | 193 MB | **519 MB** |
| `child_uuidv4` | 558 MB | 273 MB | 831 MB (+60 %) |
| `child_uuidv7` | 403 MB | 301 MB | 704 MB (+36 %) |

> Kindtabellen im Split-Identity-Muster sind bytegleich mit reinem BIGINT — die UUID-Spalte wird nicht in FK-Kindtabellen weiterpropagiert.

### Systemgesamtgrößen (Eltern + alle Kinder)

| Muster | Gesamt | vs. BIGINT |
|---|---|---|
| BIGINT | 598 MB | — |
| **BIGINT + UUID-Spalte (Split-Identity)** | **644 MB** | **+8 %** |
| UUIDv7 | 799 MB | +34 % |
| UUIDv4 | 934 MB | +56 % |

---

## Split-Identity-Lookup: BIGINT PK vs. UUID-Spalte

Schema: `parent_bigint_ext(id BIGINT PK, public_id UUID UNIQUE, ...)` — Kinder FK nur auf BIGINT.

| Test | Ø ms | min ms | max ms | Buf Hits |
|---|---|---|---|---|
| `ext_pk_lookup` — direkter BIGINT-PK | **0,006** | 0,005 | 0,011 | 4 |
| `ext_uuid_lookup` — über UUID-Unique-Index | 0,007 | 0,005 | 0,021 | 4 |
| `ext_join_via_uuid` — UUID → Eltern + BIGINT-FK-Join | 0,017 | 0,011 | 0,096 | 12 |

**Befunde:**

- Der UUID-Index-Hop kostet **~0,001 ms** (~1 µs) gegenüber einem direkten BIGINT-Lookup — liegt innerhalb des Messrauschens.
- Die Buffer-Hits sind bei beiden Einzelzeilen-Lookups identisch (4): ein Indexblock + ein Heap-Block in beiden Fällen.
- `ext_join_via_uuid` trifft 12 Buffer-Seiten — identisch mit einem regulären `fk_join` jeder anderen Variante. Die UUID-zu-BIGINT-Auflösung wird vom Planner in denselben Index-Nested-Loop-Plan absorbiert.

---

## Entwurfsmuster: UUID als externer Bezeichner neben BIGINT-Primärschlüssel

Wer die interne BIGINT-Effizienz behalten, aber nach außen keine erratbaren Sequenz-IDs exponieren möchte, trennt die zwei Rollen:

```sql
CREATE TABLE partner (
    id        BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id UUID        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    name      TEXT        NOT NULL
);

-- Alle FK-Relationen intern: BIGINT
CREATE TABLE contact (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    partner_id BIGINT NOT NULL REFERENCES partner(id),
    email      TEXT   NOT NULL
);
```

**API-Lookup-Weg:**

```sql
-- API erhält public_id → ein Index-Scan liefert die interne id
SELECT id FROM partner WHERE public_id = $1;

-- Alle nachfolgenden JOINs laufen über BIGINT-FKs
SELECT c.email
FROM   contact c
JOIN   partner p ON p.id = c.partner_id
WHERE  p.public_id = $1;
```

Der Query-Planner fasst das in einer einzigen Operation zusammen; `EXPLAIN` zeigt einen `Index Scan` auf `partner(public_id)` gefolgt von einem `Index Nested Loop` über `contact(partner_id BIGINT)`.

### Kosten und Nutzen

| Aspekt | Bewertung |
|---|---|
| Extrakosten pro Wurzel-Tabelle | +16 Byte Spalte + 1 UUID-Unique-Index (~46 MB/Mio. Zeilen) |
| FK-Tabellen | keine Mehrkosten — FKs bleiben BIGINT |
| Lookup-Latenz | +1 µs auf `public_id`; danach identisch mit reiner BIGINT-Abfrage |
| Sicherheit | sequenzielle IDs nicht exponiert → kein Enumeration-Angriff möglich |
| Portabilität | `public_id` bleibt stabil bei Shard-Splits, Datenbankmigrationen, Merge zweier Systeme |
| Bereichsabfragen | über `id` (intern) weiterhin korrekt; `public_id BETWEEN` bleibt sinnlos (UUIDv4) |

### Wann dieses Muster verwenden

- Öffentliche REST-APIs, bei denen die URL-ID nicht erratbar sein darf (`/api/partner/{public_id}`).
- Systeme, die Datensätze aus mehreren Quellen zusammenführen und global eindeutige Bezeichner benötigen.
- Wenn UUIDv7 nicht in Frage kommt (z. B. ältere PostgreSQL-Version ohne `pg_uuidv7`-Extension), aber die Fragmentierungsnachteile von UUIDv4 als PK vermieden werden sollen.

> Soll die Zeitkomponente im `public_id` erhalten bleiben (UUIDv7), genügt `DEFAULT lab_uuidv7()` — der Rest des Schemas bleibt identisch.

---

## Zusammenfassung

| Kriterium | Gewinner | Anmerkung |
|---|---|---|
| PK-Lookup | alle ≈ gleichauf | Unterschiede im Sub-Mikrosekundenbereich — reines Rauschen |
| FK-Join | alle ≈ gleichauf | Index Nested Loop bei gleicher Baumtiefe |
| Bereichssuche — Korrektheit | BIGINT, UUIDv7 | UUIDv4 `BETWEEN` liefert 0 Zeilen — semantisch defekt |
| Bereichssuche — Geschwindigkeit | BIGINT ≈ UUIDv7 | Zusammenhängender Blattseiten-Scan; UUIDv4 „gewinnt" nur durch leeren Bereich |
| Einfügeleistung | BIGINT | 3× schneller als UUIDv4; UUIDv7-Lücke überwiegend implementierungsbedingt |
| Speicher — Elterntabelle | BIGINT | Kleinster; Split-Identity +58 %, aber FK-Kinder bleiben bei BIGINT-Kosten |
| Speicher — Kindtabelle | BIGINT = Split-Identity | UUID-Spalte wird nicht in FK-Kinder weiterpropagiert |
| Speicher — Systemgesamt | BIGINT | Split-Identity (+8 %) schlägt UUIDv7 (+34 %) und UUIDv4 (+56 %) deutlich |
| UUID-Lookup-Overhead | Split-Identity | +1 µs gegenüber direktem BIGINT-PK — vernachlässigbar |

### Fazit

**Die cache-warme Punkt-Abfragelatenz ist bei allen drei Typen identisch.** Die relevanten Unterschiede zeigen sich anderswo:

1. **Bereichsabfragen auf UUIDv4 sind defekt.** `BETWEEN` auf zufälligen UUIDs liefert stillschweigend 0 Zeilen, sofern beide Grenzen nicht zufällig im UUID-Raum benachbart sind. Keyset-Paginierung (`WHERE id > last_seen`) und jedes zeitbereichsartige Abfragemuster sind mit UUIDv4 unsicher.

2. **Der Speicherkostenfaktor ist im großen Maßstab erheblich.** Der Mehraufwand von 36–60 % bei der Kindtabelle resultiert nicht allein aus den 8 zusätzlichen Bytes des Primärschlüssels — er entsteht durch die Fortpflanzung dieser Breite in jeden FK-Index, multipliziert durch die B-Baum-Seitenfragmentierung.

3. **UUIDv7 behebt beide Probleme** (Punkt 1 vollständig, die Fragmentierungskomponente aus Punkt 2) und akzeptiert dabei lediglich den 8-Byte-Breitennachteil. Es ist die richtige UUID-Wahl, wenn systemübergreifende Eindeutigkeit erforderlich ist.

4. **BIGINT bleibt optimal** für Speicher und Schreibdurchsatz, wenn Surrogatschlüssel ohne systemübergreifende Eindeutigkeitsanforderungen ausreichen.

5. **Das Split-Identity-Muster (BIGINT PK + UUID-Lookup-Spalte) vereint die Vorteile beider Welten**, wenn eine API nicht erratbare IDs exponieren muss. Der UUID-Index-Hop kostet ~1 µs und der Join-Plan ist identisch mit einem reinen BIGINT-Join. Die einzigen realen Kosten sind der zusätzliche UUID-Index auf der Wurzeltabelle (+46 MB pro 1 Mio. Zeilen); Kindtabellen bleiben bei BIGINT-Kosten — der Systemgesamt-Overhead beträgt damit nur **+8 %** gegenüber reinem BIGINT, statt +34–56 % bei reinen UUID-Schemas.
