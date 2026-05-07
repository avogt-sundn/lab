import { test, expect, Route } from '@playwright/test';

/**
 * PizzAI e2e tests — static UI behaviour only.
 *
 * The real model (~720 MB) is never loaded. We intercept the CDN request for
 * @huggingface/transformers and inject a tiny stub module that replaces the
 * pipeline factory and TextStreamer with in-process fakes.
 */

const STUB_REPLY = 'Great choice! Try the **Margherita** Medium (€11) or the **Diavola** Large (€16) if you like it spicy. Which one sounds good?';

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

async function interceptTransformers(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: TRANSFORMERS_STUB,
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/transformers.min.js', interceptTransformers);
  await page.goto('/');
});

test('page title and header are correct', async ({ page }) => {
  await expect(page).toHaveTitle(/PizzAI/);
  await expect(page.locator('header h1')).toContainText('Napoli Express');
});

test('status bar shows ready after model loads', async ({ page }) => {
  const dot = page.locator('#status-dot');
  await expect(dot).toHaveClass(/ready/, { timeout: 5000 });
  await expect(page.locator('#progress-text')).toContainText('100% locally');
});

test('input and send button unlock when model is ready', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });
  await expect(page.locator('#send-btn')).toBeEnabled();
});

test('download progress bar collapses after load', async ({ page }) => {
  await expect(page.locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
  await expect(page.locator('#dl-bar')).toHaveClass(/done/, { timeout: 3000 });
});

test('welcome message references Napoli Express with bold', async ({ page }) => {
  await expect(page.locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
  const strong = page.locator('.msg.assistant strong').first();
  await expect(strong).toContainText('PizzAI');
});

test('chips render in browsing phase on load', async ({ page }) => {
  await expect(page.locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
  const chips = page.locator('.chip');
  await expect(chips).toHaveCount(5);
  await expect(chips.first()).toContainText('menu');
});

test('sends user message and streams assistant reply with pizza bold', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('What do you recommend?');
  await page.locator('#send-btn').click();

  await expect(page.locator('.msg.user').last()).toContainText('recommend');

  const assistantMsg = page.locator('.msg.assistant').last();
  await expect(assistantMsg).toContainText('Margherita', { timeout: 5000 });
  await expect(assistantMsg.locator('strong').first()).toBeVisible();
});

test('send button disables during generation then re-enables', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('Show me vegan pizzas');
  await page.locator('#send-btn').click();

  await expect(page.locator('#user-input')).toBeDisabled();
  await expect(page.locator('#send-btn')).toBeEnabled({ timeout: 6000 });
  await expect(page.locator('#user-input')).toBeEnabled();
});

test('Enter key submits message', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('Quick question about pizza');
  await page.keyboard.press('Enter');

  await expect(page.locator('.msg.user').last()).toContainText('Quick question about pizza');
  await expect(page.locator('.msg.assistant').last()).toContainText('Margherita', { timeout: 5000 });
});

test('quick-send chip fills input and triggers send', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  const chip = page.locator('.chip').first();
  const chipText = await chip.textContent();
  await chip.click();

  await expect(page.locator('.msg.user').last()).toContainText(chipText!.trim());
  await expect(page.locator('.msg.assistant').last()).toContainText('Margherita', { timeout: 5000 });
});

test('order bar appears when pizza name is mentioned', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('I want a Margherita Medium please');
  await page.locator('#send-btn').click();
  await expect(page.locator('#send-btn')).toBeEnabled({ timeout: 6000 });

  await expect(page.locator('#order-bar')).toHaveClass(/visible/);
  await expect(page.locator('#ob-items')).toContainText('Margherita');
});

test('order bar shows running total with euro sign', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('Add a Diavola Large');
  await page.locator('#send-btn').click();
  await expect(page.locator('#send-btn')).toBeEnabled({ timeout: 6000 });

  await expect(page.locator('#ob-total')).toContainText('€');
});

test('clear order button hides order bar', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('Add a Margherita Medium');
  await page.locator('#send-btn').click();
  await expect(page.locator('#send-btn')).toBeEnabled({ timeout: 6000 });
  await expect(page.locator('#order-bar')).toHaveClass(/visible/);

  await page.locator('.ob-clear').click();
  await expect(page.locator('#order-bar')).not.toHaveClass(/visible/);
});

test('multi-turn conversation appends messages correctly', async ({ page }) => {
  await expect(page.locator('#user-input')).toBeEnabled({ timeout: 5000 });

  await page.locator('#user-input').fill('First question');
  await page.locator('#send-btn').click();
  await expect(page.locator('#send-btn')).toBeEnabled({ timeout: 6000 });

  await page.locator('#user-input').fill('Second question');
  await page.locator('#send-btn').click();
  await expect(page.locator('#send-btn')).toBeEnabled({ timeout: 6000 });

  await expect(page.locator('.msg.user')).toHaveCount(2);
  // 1 welcome + 2 replies = 3
  await expect(page.locator('.msg.assistant')).toHaveCount(3);
});
