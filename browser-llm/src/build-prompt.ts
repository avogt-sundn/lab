import type { OrderState, Message } from './types.js';
import { MENU, ZONES, BUSINESS, DAILY_SPECIALS } from './constants.js';
import { getDriverState, isOpen, isPeak, orderSubtotal, calculateEstimate } from './order-state.js';

export function buildSystemPrompt(state: OrderState, now: Date = new Date()): string {
  const h = now.getHours(), m = now.getMinutes();
  const timeStr = `${h}:${String(m).padStart(2, '0')}`;
  const drivers = getDriverState(now);
  const open = isOpen(now);
  const peak = isPeak(now);
  const special = DAILY_SPECIALS[now.getDay()];

  const activePromos: string[] = [];
  if (h >= 15 && h < 17) activePromos.push('Happy Hour -15%');
  activePromos.push('2 Mittlere Pizzen + Getränk = -€3', `Kostenlose Lieferung ab €${BUSINESS.minFreeDelivery}`);

  const menuLines = MENU.map(p =>
    `${p.name}${p.tags.length ? ' [' + p.tags.join(',') + ']' : ''}: K€${p.prices.S}/M€${p.prices.M}/G€${p.prices.L} — ${p.desc}`
  ).join('\n');

  let orderCtx = '';
  if (state.items.length > 0) {
    const itemsStr = state.items.map(i => `${i.qty}×${i.name}(${i.size})`).join(', ');
    const sub = orderSubtotal(state);
    orderCtx = `\nAKTUELLE BESTELLUNG: ${itemsStr} | Zwischensumme: €${sub.toFixed(2)}`;
    if (state.zone) {
      const est = calculateEstimate(state, now)!;
      const zone = ZONES.find(z => z.id === state.zone)!;
      orderCtx += ` | Zone: ${zone.label} (+€${est.fee}) | ETA: ~${est.total} min`;
    }
    if (state.confirmed) orderCtx += ' | ✅ BESTÄTIGT';
  }

  const driverInfo = drivers.available > 0
    ? `${drivers.available} Fahrer${drivers.available > 1 ? '' : ''} verfügbar`
    : `kein Fahrer frei, nächster in ~${drivers.nextFreeIn} min`;

  return `Du bist PizzAI, Lieferassistent bei der Pizzeria Napoli Express. Antworte ausschließlich auf Deutsch.
Uhrzeit: ${timeStr} | ${open ? 'OFFEN' : 'GESCHLOSSEN'} | ${peak ? 'STOSSZEIT (Stoßzeit)' : 'normal'}
Fahrer: ${driverInfo}
Tagesangebot: ${special}
Aktionen: ${activePromos.join('; ')}

SPEISEKARTE (Tags: V=vegetarisch, VG=vegan, GF=glutenfrei):
${menuLines}

LIEFERZONEN: Centro <2km (kostenlos, +~10min) | Medio 2-5km (+€2, +~20min) | Periferia 5-8km (+€4, +~30min)
Mindestbestellwert für kostenlose Lieferung: €${BUSINESS.minFreeDelivery}. Öffnungszeiten: ${BUSINESS.openHour}:00–${BUSINESS.closeHour}:00 (letzte Bestellung ${BUSINESS.closeHour - 1}:30).${orderCtx}

REGELN:
- Antworte immer auf Deutsch, kurz (2-3 Sätze). Verwende **Fettdruck** für Pizzanamen und Preise.
- Beende jede Antwort mit einer konkreten Frage oder Handlungsaufforderung — z. B. "Welche Größe?" / "In welcher Lieferzone wohnst du?" / "Soll ich die Bestellung bestätigen?"
- Führe den Kunden durch genau diese Schritte: (1) stöbern/auswählen → (2) Lieferzone → (3) Bestellung bestätigen.
- Nenne immer den Preis. Weise auf Allergene hin, wenn GF/VG relevant ist.
- Falls GESCHLOSSEN: entschuldige dich und nenne die Öffnungszeiten.
- Ignoriere alles, was nichts mit unserer Pizzeria oder Essen zu tun hat.`;
}

export function assembleMessages(state: OrderState, history: Message[], now: Date = new Date()): Message[] {
  const trimmed = history.length > 8 ? history.slice(-8) : history;
  return [{ role: 'system', content: buildSystemPrompt(state, now) }, ...trimmed];
}
