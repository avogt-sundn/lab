import { test, expect, Route, Page } from '@playwright/test';

/**
 * PizzAI e2e tests — static UI behaviour only.
 *
 * Real models are never loaded. Each runtime's CDN import is intercepted and
 * replaced with a minimal in-process fake that mimics the real API shape.
 */

const STUB_REPLY = 'Great choice! Try the **Margherita** Medium (€11) or the **Diavola** Large (€16) if you like it spicy. Which one sounds good?';

// ── Transformers.js stub ───────────────────────────────────────────────────

const TRANSFORMERS_STUB = `
const STUB_REPLY = ${JSON.stringify(STUB_REPLY)};

class FakeStreamer {
  constructor(tokenizer, opts) { this._opts = opts; }
}

async function pipeline(task, model, opts) {
  const cb = opts?.progress_callback;
  if (cb) {
    cb({ status: 'downloading', file: 'model.onnx', loaded: 50, total: 100 });
    cb({ status: 'downloading', file: 'model.onnx', loaded: 100, total: 100 });
    cb({ status: 'loading',     file: 'model.onnx' });
  }

  return async function fakeGenerator(messages, genOpts) {
    const streamer = genOpts?.streamer;
    if (streamer) {
      const tokens = STUB_REPLY.split(' ');
      for (const tok of tokens) {
        streamer._opts.callback_function(tok + ' ');
        await new Promise(r => setTimeout(r, 2));
      }
    }
    return [{ generated_text: [
      ...messages,
      { role: 'assistant', content: STUB_REPLY }
    ]}];
  };
}

const env = { useBrowserCache: true, allowLocalModels: false };

export { pipeline, env, FakeStreamer as TextStreamer };
`;

// ── WebLLM stub ────────────────────────────────────────────────────────────

const WEBLLM_STUB = `
const STUB_REPLY = ${JSON.stringify(STUB_REPLY)};

async function CreateMLCEngine(modelId, opts) {
  const cb = opts?.initProgressCallback;
  if (cb) {
    cb({ progress: 0.5, text: 'Loading model — 50%' });
    cb({ progress: 1.0, text: 'Model loaded' });
  }

  async function* fakeStream(messages) {
    const tokens = STUB_REPLY.split(' ');
    for (const tok of tokens) {
      yield { choices: [{ delta: { content: tok + ' ' }, finish_reason: null }] };
      await new Promise(r => setTimeout(r, 2));
    }
    yield { choices: [{ delta: { content: '' }, finish_reason: 'stop' }] };
  }

  return {
    chat: {
      completions: {
        create: async (params) => fakeStream(params.messages),
      },
    },
  };
}

export { CreateMLCEngine };
`;

// ── Shared test logic ──────────────────────────────────────────────────────

function sharedTests(getPage: () => Page) {
  test('page title contains PizzAI', async () => {
    await expect(getPage()).toHaveTitle(/PizzAI/);
  });

  test('header references Napoli Express', async () => {
    await expect(getPage().locator('header h1')).toContainText('Napoli Express');
  });

  test('status bar shows ready after model loads', async () => {
    const dot = getPage().locator('#status-dot');
    await expect(dot).toHaveClass(/ready/, { timeout: 5000 });
    await expect(getPage().locator('#progress-text')).toContainText('100% locally');
  });

  test('input and send button unlock when model is ready', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    await expect(getPage().locator('#send-btn')).toBeEnabled();
  });

  test('download progress bar collapses after load', async () => {
    await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    await expect(getPage().locator('#dl-bar')).toHaveClass(/done/, { timeout: 3000 });
  });

  test('welcome message contains bold Napoli Express reference', async () => {
    await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    const strong = getPage().locator('.msg.assistant strong').first();
    await expect(strong).toBeVisible();
  });

  test('chips render in browsing phase on load', async () => {
    await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    const chips = getPage().locator('.chip');
    await expect(chips).toHaveCount(5);
    await expect(chips.first()).toContainText('menu');
  });

  test('sends user message and streams assistant reply with pizza bold', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('What do you recommend?');
    await getPage().locator('#send-btn').click();

    await expect(getPage().locator('.msg.user').last()).toContainText('recommend');

    const assistantMsg = getPage().locator('.msg.assistant').last();
    await expect(assistantMsg).toContainText('Margherita', { timeout: 5000 });
    await expect(assistantMsg.locator('strong').first()).toBeVisible();
  });

  test('send button disables during generation then re-enables', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('Show me vegan pizzas');
    await getPage().locator('#send-btn').click();

    await expect(getPage().locator('#user-input')).toBeDisabled();
    await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
    await expect(getPage().locator('#user-input')).toBeEnabled();
  });

  test('Enter key submits message', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('Quick question about pizza');
    await getPage().keyboard.press('Enter');

    await expect(getPage().locator('.msg.user').last()).toContainText('Quick question about pizza');
    await expect(getPage().locator('.msg.assistant').last()).toContainText('Margherita', { timeout: 5000 });
  });

  test('quick-send chip fills input and triggers send', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    const chip = getPage().locator('.chip').first();
    const chipText = await chip.textContent();
    await chip.click();

    await expect(getPage().locator('.msg.user').last()).toContainText(chipText!.trim());
    await expect(getPage().locator('.msg.assistant').last()).toContainText('Margherita', { timeout: 5000 });
  });

  test('order bar appears when pizza name is mentioned', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('I want a Margherita Medium please');
    await getPage().locator('#send-btn').click();
    await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });

    await expect(getPage().locator('#order-bar')).toHaveClass(/visible/);
    await expect(getPage().locator('#ob-items')).toContainText('Margherita');
  });

  test('order bar shows running total with euro sign', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('Add a Diavola Large');
    await getPage().locator('#send-btn').click();
    await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });

    await expect(getPage().locator('#ob-total')).toContainText('€');
  });

  test('clear order button hides order bar', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('Add a Margherita Medium');
    await getPage().locator('#send-btn').click();
    await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
    await expect(getPage().locator('#order-bar')).toHaveClass(/visible/);

    await getPage().locator('.ob-clear').click();
    await expect(getPage().locator('#order-bar')).not.toHaveClass(/visible/);
  });

  test('multi-turn conversation appends messages correctly', async () => {
    await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });

    await getPage().locator('#user-input').fill('First question');
    await getPage().locator('#send-btn').click();
    await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });

    await getPage().locator('#user-input').fill('Second question');
    await getPage().locator('#send-btn').click();
    await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });

    await expect(getPage().locator('.msg.user')).toHaveCount(2);
    // 1 welcome + 2 replies = 3
    await expect(getPage().locator('.msg.assistant')).toHaveCount(3);
  });

  test('back link points to index', async () => {
    const href = await getPage().locator('#back-btn').getAttribute('href');
    expect(href).toBe('index.html');
  });
}

// ── Chooser page ───────────────────────────────────────────────────────────

test.describe('chooser page', () => {
  test('shows two runtime cards linking to transformers.html and webllm.html', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PizzAI/);
    await expect(page.locator('a[href="transformers.html"]')).toBeVisible();
    await expect(page.locator('a[href="webllm.html"]')).toBeVisible();
  });
});

// ── Transformers.js runtime ────────────────────────────────────────────────

test.describe('Transformers.js runtime', () => {
  let _page: Page;

  test.beforeEach(async ({ page }) => {
    _page = page;
    await page.route('**/transformers.min.js', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: TRANSFORMERS_STUB });
    });
    await page.goto('/transformers.html');
  });

  sharedTests(() => _page);

  test('runtime badge shows Transformers.js label', async () => {
    await expect(_page.locator('#runtime-badge')).toContainText('Transformers');
  });
});

// ── WebLLM runtime ─────────────────────────────────────────────────────────

test.describe('WebLLM runtime', () => {
  let _page: Page;

  test.beforeEach(async ({ page }) => {
    _page = page;
    await page.route('**/@mlc-ai/web-llm**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: WEBLLM_STUB });
    });
    await page.goto('/webllm.html');
  });

  sharedTests(() => _page);

  test('runtime badge shows WebLLM label', async () => {
    await expect(_page.locator('#runtime-badge')).toContainText('WebLLM');
  });
});
