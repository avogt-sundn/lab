---
name: browser-llm model selection for German inference
description: Which in-browser LLM model family to use for German-language output in lab/browser-llm, and why SmolLM2 was rejected
type: project
---

Qwen2.5-1.5B-Instruct is the chosen model family for German in-browser inference in lab/browser-llm (decided 2026-05-07).

**Why:** SmolLM2 is English-first and fails to reliably speak German even when the system prompt explicitly instructs it (`Antworte ausschließlich auf Deutsch`). Qwen2.5 has genuine multilingual training including German. EuroLLM-1.7B was considered but has no browser-ready ONNX/MLC exports as of 2026-05-07.

**How to apply:** When selecting or recommending an in-browser model for any German-language prompt pipeline in this project, default to Qwen2.5 variants. Do not revert to SmolLM2 without explicit justification. EuroLLM is a future candidate — check for ONNX/MLC availability before recommending it.

Model ID pattern per runtime:
- Transformers.js: `onnx-community/Qwen2.5-1.5B-Instruct`
- WebLLM: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`

Both runtimes use ~900 MB model downloads.
