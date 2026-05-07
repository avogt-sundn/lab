import type { Story } from './types.js';

export const story: Story = {
  id: 'glutenunvertraeglichkeit',
  title: 'Glutenunverträglicher Kunde — GF-Optionen und Allergenhinweise im Prompt',
  simulatedTime: new Date('2026-05-07T13:00:00'),

  turns: [
    {
      user: 'Ich bin glutenunverträglich. Was kann ich essen?',
      expectedState: { phase: 'browsing', items: [] },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'GF', label: 'GF-Tag in Speisekarte sichtbar' },
        { type: 'contains', target: 'system', value: 'Margherita GF', label: 'GF-Margherita in Speisekarte' },
        { type: 'contains', target: 'system', value: 'Green Garden', label: 'Green Garden in Speisekarte' },
        { type: 'contains', target: 'system', value: 'Weise auf Allergene hin, wenn GF/VG relevant ist', label: 'Allergenregel im Prompt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /gluten|GF/i, severity: 'error', label: 'Erwähnt Gluten/GF' },
        { type: 'regex', value: /margherita gf|green garden/i, severity: 'warning', label: 'Nennt eine GF-Pizza' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
    {
      user: 'Bitte eine Margherita GF Mittel',
      expectedState: {
        phase: 'selecting',
        items: [{ id: 'gfmarg', name: 'Margherita GF', size: 'M', qty: 1, price: 13 }],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Margherita GF(M)', label: 'GF-Margherita in Bestellung' },
        { type: 'contains', target: 'system', value: 'Zwischensumme: €13.00', label: 'Zwischensumme €13' },
      ],
      responseAssertions: [
        { type: 'regex', value: /margherita gf/i, severity: 'error', label: 'Bestätigt GF-Pizza namentlich' },
        { type: 'regex', value: /€\s*13|\b13\b/, severity: 'warning', label: 'Nennt Preis' },
        { type: 'regex', value: /zone|liefer|wo/i, severity: 'warning', label: 'Fragt nach Zone' },
      ],
    },
    {
      user: 'Centro',
      expectedState: { phase: 'address', zone: 'near' },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'Zone: Centro', label: 'Zone im Prompt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestätig/i, severity: 'warning', label: 'Bittet um Bestätigung' },
      ],
    },
    {
      user: 'Ja bestätigen',
      expectedState: { phase: 'confirmed', confirmed: true },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'BESTÄTIGT', label: 'Bestätigungsflag' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestell|bestätig|guten appetit/i, severity: 'warning', label: 'Bestätigt die Bestellung' },
      ],
    },
  ],
};
