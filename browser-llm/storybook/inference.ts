import type { Message } from '../src/types.js';

let generator: unknown = null;

export async function loadModel(): Promise<void> {
  const { pipeline } = await import('@huggingface/transformers');
  console.log('Loading SmolLM2-135M-Instruct (WASM)…');
  generator = await (pipeline as Function)('text-generation', 'HuggingFaceTB/SmolLM2-135M-Instruct', {
    dtype: 'q4',
    device: 'cpu',
  });
  console.log('Model ready.');
}

export async function generate(messages: Message[]): Promise<string> {
  if (!generator) throw new Error('Model not loaded — call loadModel() first');
  const result = await (generator as Function)(messages, {
    max_new_tokens: 256,
    temperature: 0,
    do_sample: false,
    repetition_penalty: 1.1,
  });
  const output = result[0]?.generated_text;
  if (Array.isArray(output)) {
    return (output.at(-1) as { content: string }).content.trim();
  }
  return String(output).trim();
}
