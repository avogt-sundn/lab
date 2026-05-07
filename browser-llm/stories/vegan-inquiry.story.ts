import type { Story } from './types.js';

export const story: Story = {
  id: 'vegane-anfrage',
  title: 'Vegane Optionen erkunden, Green Garden Groß → Medio → bestätigen',
  simulatedTime: new Date('2026-05-07T18:00:00'),

  turns: [
    {
      user: 'Habt ihr vegane Optionen?',
      expectedState: { phase: 'browsing', items: [] },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'VG', label: 'VG-Tag in Speisekarte' },
        { type: 'contains', target: 'system', value: 'Ortolana', label: 'Ortolana (VG) in Speisekarte' },
        { type: 'contains', target: 'system', value: 'Green Garden', label: 'Green Garden (VG) in Speisekarte' },
        { type: 'contains', target: 'system', value: 'OFFEN', label: 'Offen um 18:00' },
      ],
      responseAssertions: [
        { type: 'regex', value: /vegan|VG/i, severity: 'error', label: 'Erwähnt vegan' },
        { type: 'regex', value: /ortolana|green garden/i, severity: 'warning', label: 'Nennt eine vegane Pizza' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
    {
      user: 'Ich nehme eine Green Garden Groß',
      expectedState: {
        phase: 'selecting',
        items: [{ id: 'green', name: 'Green Garden', size: 'L', qty: 1, price: 18 }],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Green Garden(L)', label: 'Bestellung im Prompt' },
        { type: 'contains', target: 'system', value: 'Zwischensumme: €18.00', label: 'Zwischensumme €18' },
      ],
      responseAssertions: [
        { type: 'regex', value: /green garden/i, severity: 'error', label: 'Erwähnt die Pizza' },
        { type: 'regex', value: /€\s*18|\b18\b/, severity: 'warning', label: 'Nennt den Preis' },
        { type: 'regex', value: /zone|liefer|wo/i, severity: 'warning', label: 'Fragt nach Zone' },
      ],
    },
    {
      user: 'Ich wohne in der Medio-Zone',
      expectedState: { phase: 'address', zone: 'mid' },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'Zone: Medio', label: 'Zone im Prompt' },
        { type: 'regex', target: 'system', value: /ETA: ~\d+ min/, label: 'ETA berechnet' },
        { type: 'contains', target: 'system', value: '+€2', label: 'Liefergebühr €2' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestätig/i, severity: 'warning', label: 'Bittet um Bestätigung' },
      ],
    },
    {
      user: 'Bestellung bestätigen',
      expectedState: { phase: 'confirmed', confirmed: true },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'BESTÄTIGT', label: 'Bestätigt im Prompt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestell|bestätig|guten appetit/i, severity: 'warning', label: 'Bestätigt die Bestellung' },
      ],
    },
  ],
};
