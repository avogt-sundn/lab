import type { Story } from './types.js';

export const story: Story = {
  id: 'mehrere-pizzen-periferia',
  title: 'Drei Pizzen, Zone Periferia, Gratislieferung-Schwelle prüfen',
  simulatedTime: new Date('2026-05-07T20:00:00'),

  turns: [
    {
      user: 'Ich möchte eine Margherita Groß',
      expectedState: {
        phase: 'selecting',
        items: [{ id: 'marg', name: 'Margherita', size: 'L', qty: 1, price: 14 }],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Margherita(L)', label: 'Margherita L in Bestellung' },
        { type: 'contains', target: 'system', value: 'STOSSZEIT', label: 'Stoßzeit-Flag aktiv' },
      ],
      responseAssertions: [
        { type: 'regex', value: /margherita/i, severity: 'warning', label: 'Erwähnt die Pizza' },
      ],
    },
    {
      user: 'Und eine Diavola Mittel',
      expectedState: {
        phase: 'selecting',
        items: [
          { id: 'marg', name: 'Margherita', size: 'L', qty: 1, price: 14 },
          { id: 'diav', name: 'Diavola',    size: 'M', qty: 1, price: 13 },
        ],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Diavola(M)', label: 'Diavola M in Bestellung' },
      ],
    },
    {
      user: 'Noch eine Funghi Klein',
      expectedState: {
        phase: 'selecting',
        items: [
          { id: 'marg', name: 'Margherita', size: 'L', qty: 1, price: 14 },
          { id: 'diav', name: 'Diavola',    size: 'M', qty: 1, price: 13 },
          { id: 'fung', name: 'Funghi',     size: 'S', qty: 1, price: 9  },
        ],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Funghi(S)',      label: 'Funghi S in Bestellung' },
        { type: 'contains', target: 'system', value: 'Zwischensumme: €36.00', label: 'Zwischensumme €36 (über Gratislieferung)' },
      ],
      responseAssertions: [
        { type: 'regex', value: /zone|liefer|wo/i, severity: 'warning', label: 'Fragt nach Zone' },
      ],
    },
    {
      user: 'Periferia',
      expectedState: { phase: 'address', zone: 'far' },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'Zone: Periferia', label: 'Zone Periferia im Prompt' },
        { type: 'regex', target: 'system', value: /ETA: ~\d+ min/, label: 'ETA berechnet (Stoßzeit-Multiplikator)' },
        { type: 'contains', target: 'system', value: '+€4', label: 'Liefergebühr €4 für Periferia' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestätig/i, severity: 'warning', label: 'Bittet um Bestätigung' },
      ],
    },
    {
      user: 'Bestellung aufgeben',
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
