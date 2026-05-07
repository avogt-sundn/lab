network:
	docker network create docker-default-network 2>/dev/null || true

## bigint-vs-uuid — BIGINT vs UUIDv4 vs UUIDv7 primary key benchmark (~3 min)
bigint-vs-uuid: network
	docker compose build proof-bigint-vs-uuid
	docker compose run --rm proof-bigint-vs-uuid

## bulk-index-latency — ES bulk indexing: sequential vs parallel, JVM vs Native (~25 min incl. native build)
bulk-index-latency: network
	docker compose build indexer-jvm indexer-native proof-bulk-index-latency
	docker compose up -d postgres-lab elasticsearch-lab-bulk indexer-jvm indexer-native
	docker compose run --rm proof-bulk-index-latency
	docker compose stop elasticsearch-lab-bulk indexer-jvm indexer-native

## debezium-cdc — Debezium CDC latency: insert → Kafka event, batch sizes 1/10/100/1000 (~10 min)
debezium-cdc: network
	docker compose build proof-debezium-cdc
	docker compose up -d postgres-lab kafka-lab debezium-connect-lab
	docker compose run --rm proof-debezium-cdc
	docker compose stop kafka-lab debezium-connect-lab

## browser-llm — PizzAI: on-device LLM in the browser, no backend required
browser-llm: network
	docker compose build pizzai-web
	docker compose up -d pizzai-web
	docker compose exec pizzai-web wget -qO- http://localhost/ > /dev/null
	xdg-open http://localhost:8091 2>/dev/null || open http://localhost:8091 2>/dev/null || echo "Open http://localhost:8091 in Chrome/Edge (WebGPU required)"
	@echo ""
	@echo "  PizzAI is running at http://localhost:8091"
	@echo "  Press Ctrl-C then run 'make browser-llm-down' to stop."

## browser-llm-test — run PizzAI Playwright tests (starts pizzai-web if not running)
browser-llm-test: network
	docker compose build pizzai-e2e
	docker compose run --rm pizzai-e2e

## browser-llm-storybook — run PizzAI prompt storybook (pipeline + inference)
browser-llm-storybook: network
	docker compose build pizzai-storybook
	docker compose run --rm pizzai-storybook

## browser-llm-storybook-pipeline — fast deterministic pipeline-only storybook
browser-llm-storybook-pipeline: network
	docker compose build pizzai-storybook
	docker compose run --rm pizzai-storybook node dist/storybook/cli.js --layer pipeline

browser-llm-down:
	docker compose stop pizzai-web

## down — stop and remove all lab containers and volumes
down:
	docker compose down --volumes

.PHONY: network bigint-vs-uuid bulk-index-latency debezium-cdc browser-llm browser-llm-test browser-llm-storybook browser-llm-storybook-pipeline browser-llm-down down
