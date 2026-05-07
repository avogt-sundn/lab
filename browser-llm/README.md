# Browser LLM — PizzAI (Napoli Express delivery assistant)

**Question:** Can a quantized LLM behave as a realistic domain expert when grounded entirely in structured data injected via the system prompt, running with zero server-side inference?

## What this proves

A 360M-parameter instruction-tuned model (`SmolLM2-360M-Instruct`, q4 quantized) can be grounded in a defined business dataset — menu, delivery zones, driver availability, promotions — via a dynamically assembled system prompt. The model then acts as a pizza delivery assistant that gives accurate prices, realistic ETAs, and guides customers through an order flow, all without hallucinating menu items.

Key techniques demonstrated:
- **System-prompt engineering as a data layer**: structured JS constants (menu, zones, drivers) are serialised into a compact ~450-token prompt per turn.
- **Client-side intent parsing**: lightweight regex on user input extracts order state (pizza selected, zone, confirmation) — the LLM stays stateless; the JS layer tracks the order and re-injects it every turn.
- **Time-aware context**: the prompt includes current time, kitchen open/closed status, peak-hour flag, driver count, and a rotating daily special.
- **Phase-aware UI**: quick-action chips adapt to the current order phase (browsing → selecting → address → confirmed).

## Stack

| Component | Technology |
|---|---|
| Web server | `nginx:alpine` — serves a single static `index.html` |
| ML runtime | [`@huggingface/transformers@3`](https://huggingface.co/docs/transformers.js) loaded from CDN |
| Model | `HuggingFaceTB/SmolLM2-360M-Instruct` — q4 quantized (~720 MB) |
| Inference backend | WebGPU (primary) → WASM (fallback) |
| Model cache | Browser OPFS — survives page reload, no re-download |

## Browser support

| Browser | WebGPU | WASM fallback |
|---|---|---|
| Chrome 113+ | ✅ | ✅ |
| Edge 113+ | ✅ | ✅ |
| Safari 18+ | ✅ | ✅ |
| Firefox | ❌ | ✅ (slower) |

WebGPU is required for practical response times (~2–5 s/reply on a mid-range GPU). WASM fallback works but is roughly 5× slower.

## Run

```bash
docker compose build pizzai-web
docker compose up -d pizzai-web
docker compose exec pizzai-web wget -qO- http://localhost/ > /dev/null
xdg-open http://localhost:8091 2>/dev/null || open http://localhost:8091 2>/dev/null || echo "Open http://localhost:8091 in Chrome/Edge (WebGPU required)"
@echo ""
@echo "  PizzAI is running at http://localhost:8091"
@echo "  Press Ctrl-C then run 'make browser-llm-down' to stop."
```

On first visit the browser downloads the model weights (~720 MB) directly from Hugging Face CDN. Subsequent visits load from OPFS cache in a few seconds.

## First-visit flow

```
make browser-llm
  └─ docker compose build pizzai-web      # nginx:alpine + index.html (~50 MB image)
  └─ docker compose up -d pizzai-web      # starts on port 8091
  └─ opens http://localhost:8091

browser loads index.html
  └─ imports @huggingface/transformers from CDN (JS only, ~1 MB)
  └─ downloads SmolLM2-360M-Instruct weights from HF CDN (~720 MB, once)
  └─ caches weights in OPFS
  └─ loads model onto GPU via WebGPU
  └─ chat input unlocks → inference runs locally
```

## Files

| File | Purpose |
|---|---|
| `index.html` | Full chat UI + Transformers.js integration — single self-contained file, no build step |
| `Dockerfile` | `nginx:alpine` serving `index.html` |
| `docker-compose.yaml` | `pizzai-web` service on host port 8091 |

## Constraints and caveats

- **Model quality**: 360M parameters is compact. Answers are coherent for narrow domains but will hallucinate on complex reasoning. The system prompt and short `max_new_tokens` limit mitigate this.
- **Memory**: q4 quantization requires ~500 MB GPU VRAM. Devices with < 1 GB available VRAM may fall back to WASM automatically.
- **Cold start**: First inference after model load takes 1–3 s due to shader compilation (WebGPU). Subsequent calls are faster.
- **Streaming**: Tokens stream into the chat as they are generated via `TextStreamer` callback. A stop button interrupts generation mid-stream.
