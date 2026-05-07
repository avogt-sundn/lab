package com.example.lab.indexer;

import io.smallrye.common.annotation.Blocking;
import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.Map;

@Path("/reindex")
@Produces(MediaType.APPLICATION_JSON)
public class ReindexResource {

    @Inject
    ReindexService reindexService;

    @POST
    @Blocking
    public Response reindex(
            @QueryParam("batchSize") @DefaultValue("1000") int batchSize,
            @QueryParam("strategy") @DefaultValue("sequential") String strategy) {
        try {
            Strategy s = Strategy.valueOf(strategy.toUpperCase());
            long start = System.currentTimeMillis();
            long count = reindexService.reindex(batchSize, s);
            long durationMs = System.currentTimeMillis() - start;
            return Response.ok(Map.of(
                "documentsIndexed", count,
                "durationMs", durationMs,
                "batchSize", batchSize,
                "strategy", strategy
            )).build();
        } catch (IllegalArgumentException e) {
            return Response.status(400).entity(Map.of("error", "unknown strategy: " + strategy)).build();
        } catch (Exception e) {
            return Response.serverError().entity(Map.of("error", e.getMessage())).build();
        }
    }
}
