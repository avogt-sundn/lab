import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Story } from '../stories/types.js';
import { runStory, type Layer } from './runner.js';
import { printResults } from './reporter.js';

const __dir = fileURLToPath(new URL('..', import.meta.url));

async function loadStories(filter?: string): Promise<Story[]> {
  const storiesDir = join(__dir, 'stories');
  const files = (await readdir(storiesDir)).filter(f => f.endsWith('.story.js'));
  const stories: Story[] = [];
  for (const f of files) {
    if (filter && !f.includes(filter)) continue;
    const mod = await import(join(storiesDir, f)) as { story: Story };
    stories.push(mod.story);
  }
  return stories;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let layer: Layer = 'pipeline';
  let filter: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--layer' && args[i + 1]) { layer = args[++i] as Layer; }
    else if (args[i] === '--stories' && args[i + 1]) { filter = args[++i]; }
  }
  return { layer, filter };
}

async function main() {
  const { layer, filter } = parseArgs();

  const stories = await loadStories(filter);
  if (!stories.length) {
    console.error('Keine Stories gefunden.');
    process.exit(1);
  }

  let generateFn: ((msgs: import('../src/types.js').Message[]) => Promise<string>) | undefined;
  if (layer === 'inference' || layer === 'both') {
    const { loadModel, generate } = await import('./inference.js');
    await loadModel();
    generateFn = generate;
  }

  const results = [];
  for (const story of stories) {
    process.stdout.write(`Running: ${story.id}…\n`);
    const result = await runStory(story, layer, generateFn);
    results.push(result);
  }

  printResults(results, layer);

  const anyFailed = results.some(r => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
