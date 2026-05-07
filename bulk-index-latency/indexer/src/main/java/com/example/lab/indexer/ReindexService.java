package com.example.lab.indexer;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.BulkRequest;
import co.elastic.clients.elasticsearch.core.bulk.BulkOperation;
import co.elastic.clients.elasticsearch.indices.CreateIndexRequest;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicLong;

@ApplicationScoped
public class ReindexService {

    private static final Logger log = Logger.getLogger(ReindexService.class);

    // Minimal mapping: no custom analyzers — we care about throughput, not search quality
    private static final String INDEX_MAPPING = """
        {
          "settings": { "number_of_replicas": 0, "refresh_interval": "-1" },
          "mappings": {
            "properties": {
              "partnerNumber": { "type": "long" },
              "alphaCode":     { "type": "keyword" },
              "name1":         { "type": "text" },
              "name2":         { "type": "text" },
              "name3":         { "type": "text" },
              "firstname":     { "type": "text" },
              "street":        { "type": "text" },
              "houseNumber":   { "type": "keyword" },
              "postalCode":    { "type": "keyword" },
              "city":          { "type": "text" },
              "type":          { "type": "keyword" },
              "groupType":     { "type": "keyword" },
              "groupNumber":   { "type": "long" }
            }
          }
        }
        """;

    @Inject
    ElasticsearchClient esClient;

    @Inject
    EntityManager em;

    public long reindex(int batchSize, Strategy strategy) throws Exception {
        deleteAndCreateIndex();

        long count = switch (strategy) {
            case SEQUENTIAL -> indexSequential(batchSize);
            case PARALLEL   -> indexParallel(batchSize);
        };

        restoreRefreshAndFlush();
        return count;
    }

    private long indexSequential(int batchSize) throws Exception {
        long lastId = 0;
        long total = 0;
        List<Partner> batch;
        do {
            batch = loadPage(lastId, batchSize);
            if (!batch.isEmpty()) {
                bulkIndex(batch);
                total += batch.size();
                lastId = batch.getLast().id;
            }
        } while (batch.size() == batchSize);
        return total;
    }

    private long indexParallel(int batchSize) throws Exception {
        // 1 reader thread → bounded queue → 2 indexer threads
        var queue = new ArrayBlockingQueue<List<Partner>>(3);
        List<Partner> poison = List.of();
        var counter = new AtomicLong(0);

        var producer = CompletableFuture.runAsync(() -> {
            try {
                long lastId = 0;
                List<Partner> batch;
                do {
                    batch = loadPage(lastId, batchSize);
                    if (!batch.isEmpty()) {
                        queue.put(batch);
                        lastId = batch.getLast().id;
                    }
                } while (batch.size() == batchSize);
                // Two poison pills for two consumers
                queue.put(poison);
                queue.put(poison);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        });

        var consumer1 = CompletableFuture.runAsync(() -> drainQueue(queue, poison, counter));
        var consumer2 = CompletableFuture.runAsync(() -> drainQueue(queue, poison, counter));

        CompletableFuture.allOf(producer, consumer1, consumer2).join();
        return counter.get();
    }

    private void drainQueue(ArrayBlockingQueue<List<Partner>> queue, List<Partner> poison, AtomicLong counter) {
        try {
            List<Partner> batch;
            while ((batch = queue.take()) != poison) {
                bulkIndex(batch);
                counter.addAndGet(batch.size());
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Transactional
    public List<Partner> loadPage(long lastId, int size) {
        return em.createQuery(
                "FROM Partner p WHERE p.id > :lastId ORDER BY p.id ASC", Partner.class)
            .setParameter("lastId", lastId)
            .setMaxResults(size)
            .getResultList();
    }

    private void bulkIndex(List<Partner> partners) throws Exception {
        List<BulkOperation> ops = new ArrayList<>(partners.size());
        for (Partner p : partners) {
            PartnerDocument doc = toDocument(p);
            ops.add(BulkOperation.of(op -> op
                .index(i -> i
                    .index("partners")
                    .id(String.valueOf(doc.partnerNumber))
                    .document(doc))));
        }
        esClient.bulk(BulkRequest.of(r -> r.operations(ops)));
    }

    private void deleteAndCreateIndex() throws Exception {
        esClient.indices().delete(d -> d.index("partners").ignoreUnavailable(true));
        esClient.indices().create(CreateIndexRequest.of(r -> r
            .index("partners")
            .withJson(new StringReader(INDEX_MAPPING))));
    }

    private void restoreRefreshAndFlush() throws Exception {
        esClient.indices().putSettings(s -> s
            .index("partners")
            .settings(t -> t.refreshInterval(ri -> ri.time("1s"))));
        esClient.indices().refresh(r -> r.index("partners"));
    }

    private PartnerDocument toDocument(Partner p) {
        PartnerDocument d = new PartnerDocument();
        d.partnerNumber = p.partnerNumber;
        d.alphaCode     = p.alphaCode;
        d.name1         = p.name1;
        d.name2         = p.name2;
        d.name3         = p.name3;
        d.firstname     = p.firstname;
        d.street        = p.street;
        d.houseNumber   = p.houseNumber;
        d.postalCode    = p.postalCode;
        d.city          = p.city;
        d.type          = p.type;
        d.groupType     = p.groupType;
        d.groupNumber   = p.groupNumber;
        return d;
    }
}
