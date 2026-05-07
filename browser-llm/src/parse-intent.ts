import type { OrderState } from './types.js';
import { MENU } from './constants.js';

export function parseUserIntent(text: string, state: OrderState): OrderState {
  const s: OrderState = {
    phase: state.phase,
    items: state.items.map(i => ({ ...i })),
    zone: state.zone,
    confirmed: state.confirmed,
  };
  const lower = text.toLowerCase();

  if (/neu starten|bestellung abbrechen|bestellung löschen|neue bestellung|start over|cancel order|clear order|new order/i.test(lower)) {
    return { phase: 'browsing', items: [], zone: null, confirmed: false };
  }

  // Sort longest name first so "Margherita GF" is matched before "Margherita".
  let remaining = lower;
  for (const pizza of [...MENU].sort((a, b) => b.name.length - a.name.length)) {
    const lowerName = pizza.name.toLowerCase();
    if (remaining.includes(lowerName) || remaining.includes(pizza.id)) {
      const size = /\bgro(ß|ss)\b|large|grande/i.test(lower) ? 'L' : /\bklein\b|small|piccol/i.test(lower) ? 'S' : 'M';
      const qtyMatch = lower.match(/(\d+)\s*x\b/) || lower.match(/\b(\d+)\s+(?:of\s+)?(?:the\s+)?(?:a\s+)?/i);
      const qty = qtyMatch ? Math.min(parseInt(qtyMatch[1], 10), 10) : 1;
      const existing = s.items.find(i => i.id === pizza.id && i.size === size);
      if (existing) {
        existing.qty += qty;
      } else {
        s.items.push({ id: pizza.id, name: pizza.name, size, qty, price: pizza.prices[size] });
      }
      if (s.phase === 'browsing') s.phase = 'selecting';
      remaining = remaining.replace(new RegExp(lowerName.replace(/\s+/g, '\\s+'), 'gi'), ' '.repeat(lowerName.length));
    }
  }

  if (/\bcentro\b|< ?2\s*km|\bnear\b|city.?cent/i.test(lower)) {
    s.zone = 'near';
    if (s.items.length) s.phase = 'address';
  } else if (/\bmedio\b|2.?5\s*km|\bmid\b/i.test(lower)) {
    s.zone = 'mid';
    if (s.items.length) s.phase = 'address';
  } else if (/\bperif/i.test(lower) || /5.?8\s*km/i.test(lower) || /\bfar\b/i.test(lower)) {
    s.zone = 'far';
    if (s.items.length) s.phase = 'address';
  }

  if (/das (ist|w[äa]re) alles|bestellung (abschlie(ß|ss)en|fertig|abgeben)|fertig.*bestell/i.test(lower) ||
      /that.?s (all|it)|done.*order|finish.*order|ready.*order/i.test(lower)) {
    if (s.items.length && !s.zone) s.phase = 'address';
  }

  if (/\bbestätigen\b|\bbestätigt\b|bestellung aufgeben|ja.*bestätigen|ja.*bestell|place.*order|yes.*confirm|order.*confirm|\bconfirm\b/i.test(lower)) {
    if (s.items.length && s.zone) {
      s.phase = 'confirmed';
      s.confirmed = true;
    }
  }

  return s;
}
