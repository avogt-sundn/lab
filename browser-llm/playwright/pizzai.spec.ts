import { test, expect, Route, Page } from '@playwright/test';

/**
 * PizzAI e2e-Tests — nur statisches UI-Verhalten.
 *
 * Echte Modelle werden nie geladen. Jeder Runtime-CDN-Import wird abgefangen
 * und durch ein minimales In-Process-Fake ersetzt, das die echte API-Form nachahmt.
 * Alle Nutzer-Inputs und Antworten sind auf Deutsch.
 */

const STUB_REPLY = 'Gute Wahl! Probiere die **Margherita** Mittel (€11) oder die **Diavola** Groß (€16) wenn du es scharf magst. Welche klingt besser?';

// ── Transformers.js Stub ───────────────────────────────────────────────────

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

// ── WebLLM Stub ────────────────────────────────────────────────────────────

const WEBLLM_STUB = `
const STUB_REPLY = ${JSON.stringify(STUB_REPLY)};

async function CreateMLCEngine(modelId, opts) {
  const cb = opts?.initProgressCallback;
  if (cb) {
    cb({ progress: 0.5, text: 'Lade Modell — 50%' });
    cb({ progress: 1.0, text: 'Modell geladen' });
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

// ── Gemeinsame Testlogik (Gherkin-Stil) ────────────────────────────────────

function sharedTests(getPage: () => Page) {
  test('Seitentitel enthält PizzAI', async () => {
    await test.step('Given die PizzAI-Seite ist geöffnet', async () => {
      await expect(getPage()).toHaveTitle(/PizzAI/);
    });
  });

  test('Header referenziert Napoli Express', async () => {
    await test.step('Given die Seite ist geladen', async () => {
      await expect(getPage().locator('header h1')).toContainText('Napoli Express');
    });
  });

  test('Statusleiste zeigt "bereit" nach Modell-Ladung', async () => {
    await test.step('When das Modell fertig geladen ist', async () => {
      const dot = getPage().locator('#status-dot');
      await expect(dot).toHaveClass(/ready/, { timeout: 5000 });
    });
    await test.step('Then zeigt der Fortschrittstext 100% lokal', async () => {
      await expect(getPage().locator('#progress-text')).toContainText('100%');
    });
  });

  test('Eingabe und Senden-Button werden freigeschaltet wenn Modell bereit', async () => {
    await test.step('When das Modell bereit ist', async () => {
      await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    });
    await test.step('Then ist das Eingabefeld aktiviert', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('And der Senden-Button ist aktiviert', async () => {
      await expect(getPage().locator('#send-btn')).toBeEnabled();
    });
  });

  test('Fortschrittsbalken blendet sich nach Laden aus', async () => {
    await test.step('When der Status auf bereit wechselt', async () => {
      await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    });
    await test.step('Then verschwindet der Download-Balken', async () => {
      await expect(getPage().locator('#dl-bar')).toHaveClass(/done/, { timeout: 3000 });
    });
  });

  test('Willkommensnachricht enthält fetten Napoli Express Verweis', async () => {
    await test.step('Given das Modell ist geladen', async () => {
      await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    });
    await test.step('Then ist ein fettes Element in der Assistentennachricht sichtbar', async () => {
      const strong = getPage().locator('.msg.assistant strong').first();
      await expect(strong).toBeVisible();
    });
  });

  test('Chips werden in der Browse-Phase beim Laden angezeigt', async () => {
    await test.step('Given das Modell ist geladen', async () => {
      await expect(getPage().locator('#status-dot')).toHaveClass(/ready/, { timeout: 5000 });
    });
    await test.step('Then sind 5 Chips sichtbar', async () => {
      const chips = getPage().locator('.chip');
      await expect(chips).toHaveCount(5);
    });
    await test.step('And der erste Chip enthält Menü-Bezug', async () => {
      await expect(getPage().locator('.chip').first()).toContainText(/[Mm]enü|[Mm]enu/);
    });
  });

  test('Nutzeranfrage senden und Assistentenantwort mit fetter Pizza empfangen', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich eine Empfehlung anfrage', async () => {
      await getPage().locator('#user-input').fill('Was empfiehlst du mir?');
      await getPage().locator('#send-btn').click();
    });
    await test.step('Then erscheint meine Nachricht im Chat', async () => {
      await expect(getPage().locator('.msg.user').last()).toContainText('empfiehlst');
    });
    await test.step('And die Assistentenantwort enthält die Pizza Margherita fett', async () => {
      const assistantMsg = getPage().locator('.msg.assistant').last();
      await expect(assistantMsg).toContainText('Margherita', { timeout: 5000 });
      await expect(assistantMsg.locator('strong').first()).toBeVisible();
    });
  });

  test('Senden-Button wird während Generierung deaktiviert und danach wieder aktiviert', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich eine Nachricht abschicke', async () => {
      await getPage().locator('#user-input').fill('Zeig mir vegane Pizzen');
      await getPage().locator('#send-btn').click();
    });
    await test.step('Then ist das Eingabefeld während der Generierung gesperrt', async () => {
      await expect(getPage().locator('#user-input')).toBeDisabled();
    });
    await test.step('And nach der Generierung ist der Senden-Button wieder aktiv', async () => {
      await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
      await expect(getPage().locator('#user-input')).toBeEnabled();
    });
  });

  test('Enter-Taste schickt Nachricht ab', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich Text eingebe und Enter drücke', async () => {
      await getPage().locator('#user-input').fill('Kurze Frage zur Pizza');
      await getPage().keyboard.press('Enter');
    });
    await test.step('Then erscheint meine Nachricht im Chat', async () => {
      await expect(getPage().locator('.msg.user').last()).toContainText('Kurze Frage zur Pizza');
    });
    await test.step('And die Assistentenantwort erscheint', async () => {
      await expect(getPage().locator('.msg.assistant').last()).toContainText('Margherita', { timeout: 5000 });
    });
  });

  test('Schnell-Chip füllt Eingabe und löst Senden aus', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich auf den ersten Chip klicke', async () => {
      const chip = getPage().locator('.chip').first();
      const chipText = await chip.textContent();
      await chip.click();
      await test.step('Then erscheint der Chip-Text im Chat', async () => {
        await expect(getPage().locator('.msg.user').last()).toContainText(chipText!.trim());
      });
    });
    await test.step('And die Assistentenantwort erscheint', async () => {
      await expect(getPage().locator('.msg.assistant').last()).toContainText('Margherita', { timeout: 5000 });
    });
  });

  test('Bestellleiste erscheint wenn Pizzaname erwähnt wird', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich eine Margherita bestelle', async () => {
      await getPage().locator('#user-input').fill('Ich möchte eine Margherita Mittel bitte');
      await getPage().locator('#send-btn').click();
      await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
    });
    await test.step('Then ist die Bestellleiste sichtbar', async () => {
      await expect(getPage().locator('#order-bar')).toHaveClass(/visible/);
    });
    await test.step('And zeigt Margherita in den Bestellpositionen', async () => {
      await expect(getPage().locator('#ob-items')).toContainText('Margherita');
    });
  });

  test('Bestellleiste zeigt laufende Summe mit Euro-Zeichen', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich eine Diavola Groß hinzufüge', async () => {
      await getPage().locator('#user-input').fill('Eine Diavola Groß bitte');
      await getPage().locator('#send-btn').click();
      await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
    });
    await test.step('Then enthält die Gesamtanzeige das Euro-Zeichen', async () => {
      await expect(getPage().locator('#ob-total')).toContainText('€');
    });
  });

  test('Bestellung löschen verbirgt die Bestellleiste', async () => {
    await test.step('Given es gibt eine aktive Bestellung', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
      await getPage().locator('#user-input').fill('Eine Margherita Mittel bitte');
      await getPage().locator('#send-btn').click();
      await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
      await expect(getPage().locator('#order-bar')).toHaveClass(/visible/);
    });
    await test.step('When ich auf Bestellung löschen klicke', async () => {
      await getPage().locator('.ob-clear').click();
    });
    await test.step('Then ist die Bestellleiste nicht mehr sichtbar', async () => {
      await expect(getPage().locator('#order-bar')).not.toHaveClass(/visible/);
    });
  });

  test('Mehrturniges Gespräch fügt Nachrichten korrekt an', async () => {
    await test.step('Given das Modell ist bereit', async () => {
      await expect(getPage().locator('#user-input')).toBeEnabled({ timeout: 5000 });
    });
    await test.step('When ich zwei Nachrichten sende', async () => {
      await getPage().locator('#user-input').fill('Erste Frage');
      await getPage().locator('#send-btn').click();
      await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
      await getPage().locator('#user-input').fill('Zweite Frage');
      await getPage().locator('#send-btn').click();
      await expect(getPage().locator('#send-btn')).toBeEnabled({ timeout: 6000 });
    });
    await test.step('Then sind 2 Nutzernachrichten im Chat', async () => {
      await expect(getPage().locator('.msg.user')).toHaveCount(2);
    });
    await test.step('And sind 3 Assistentennachrichten im Chat (1 Begrüßung + 2 Antworten)', async () => {
      await expect(getPage().locator('.msg.assistant')).toHaveCount(3);
    });
  });

  test('Zurück-Link zeigt auf index', async () => {
    await test.step('Given die Seite ist geladen', async () => {
      const href = await getPage().locator('#back-btn').getAttribute('href');
      expect(href).toBe('index.html');
    });
  });
}

// ── Auswahlseite ───────────────────────────────────────────────────────────

test.describe('Auswahlseite', () => {
  test('zeigt zwei Runtime-Karten mit Links zu transformers.html und webllm.html', async ({ page }) => {
    await test.step('Given ich die Startseite öffne', async () => {
      await page.goto('/');
    });
    await test.step('Then hat die Seite den Titel PizzAI', async () => {
      await expect(page).toHaveTitle(/PizzAI/);
    });
    await test.step('And Transformers.js Karte ist sichtbar', async () => {
      await expect(page.locator('a[href="transformers.html"]')).toBeVisible();
    });
    await test.step('And WebLLM Karte ist sichtbar', async () => {
      await expect(page.locator('a[href="webllm.html"]')).toBeVisible();
    });
  });
});

// ── Transformers.js Runtime ────────────────────────────────────────────────

test.describe('Transformers.js Runtime', () => {
  let _page: Page;

  test.beforeEach(async ({ page }) => {
    _page = page;
    await page.route('**/transformers.min.js', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: TRANSFORMERS_STUB });
    });
    await page.goto('/transformers.html');
  });

  sharedTests(() => _page);

  test('Runtime-Badge zeigt Transformers.js Label', async () => {
    await test.step('Given die Seite ist geladen', async () => {
      await expect(_page.locator('#runtime-badge')).toContainText('Transformers');
    });
  });
});

// ── WebLLM Runtime ─────────────────────────────────────────────────────────

test.describe('WebLLM Runtime', () => {
  let _page: Page;

  test.beforeEach(async ({ page }) => {
    _page = page;
    await page.route('**/@mlc-ai/web-llm**', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/javascript', body: WEBLLM_STUB });
    });
    await page.goto('/webllm.html');
  });

  sharedTests(() => _page);

  test('Runtime-Badge zeigt WebLLM Label', async () => {
    await test.step('Given die Seite ist geladen', async () => {
      await expect(_page.locator('#runtime-badge')).toContainText('WebLLM');
    });
  });
});
