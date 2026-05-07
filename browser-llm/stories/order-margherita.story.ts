import type { Story } from './types.js';

export const story: Story = {
  id: 'bestellung-margherita-standard',
  title: 'Happy Path: eine Margherita → Centro → bestätigen',
  description: 'Kunde bestellt eine Margherita Mittel, wählt Centro, bestätigt.',
  simulatedTime: new Date('2026-05-07T14:30:00'),

  turns: [
    {
      user: 'Ich möchte bitte eine Margherita Mittel',
      expectedState: {
        phase: 'selecting',
        items: [{ id: 'marg', name: 'Margherita', size: 'M', qty: 1, price: 11 }],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Margherita(M)', label: 'Bestellung im Prompt' },
        { type: 'contains', target: 'system', value: 'OFFEN', label: 'Laden ist offen um 14:30' },
        { type: 'not-contains', target: 'system', value: 'STOSSZEIT', label: 'Keine Stoßzeit um 14:30' },
        { type: 'contains', target: 'system', value: 'Zwischensumme: €11.00', label: 'Zwischensumme korrekt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /margherita/i, severity: 'error', label: 'Erwähnt die Pizza' },
        { type: 'regex', value: /€\s*11|\b11\b/, severity: 'warning', label: 'Nennt den Preis' },
        { type: 'regex', value: /\?/, severity: 'warning', label: 'Endet mit einer Frage' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
    {
      user: 'Ich bin in Centro',
      expectedState: {
        phase: 'address',
        zone: 'near',
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'Zone: Centro', label: 'Zone im Prompt' },
        { type: 'regex', target: 'system', value: /ETA: ~\d+ min/, label: 'ETA berechnet' },
        { type: 'contains', target: 'system', value: '+€0', label: 'Kostenlose Lieferung für Centro (+€0)' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestätig/i, severity: 'warning', label: 'Bittet um Bestätigung' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
    {
      user: 'Ja, bitte bestätigen',
      expectedState: {
        phase: 'confirmed',
        confirmed: true,
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'BESTÄTIGT', label: 'Bestätigungsflag im Prompt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestätig|bestellung|aufgegeben/i, severity: 'warning', label: 'Bestätigt die Bestellung' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
  ],
};
