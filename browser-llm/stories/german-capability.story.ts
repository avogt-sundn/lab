import type { Story } from './types.js';

export const story: Story = {
  id: 'deutschsprachige-faehigkeit',
  title: 'Modell antwortet auf Deutsch — Sprach- und Inhaltskompetenz prüfen',
  description: 'Verifiziert, dass das Modell ausschließlich auf Deutsch antwortet und korrekte Schlüsselbegriffe verwendet.',
  simulatedTime: new Date('2026-05-07T15:00:00'),

  turns: [
    {
      user: 'Hallo! Was habt ihr heute im Angebot?',
      expectedState: { phase: 'browsing', items: [] },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'Deutsch', label: 'Sprachvorgabe im Prompt' },
        { type: 'contains', target: 'system', value: 'Tagesangebot', label: 'Tagesangebot-Label im Prompt' },
        { type: 'contains', target: 'system', value: 'OFFEN', label: 'Offen um 15:00' },
      ],
      responseAssertions: [
        { type: 'regex', value: /pizza|angebot|speisekarte|heute/i, severity: 'error', label: 'Antwortet mit relevantem Inhalt' },
        { type: 'not-contains', value: 'Ciao', severity: 'warning', label: 'Kein englischer/italienischer Begrüßungssatz' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
    {
      user: 'Ich möchte eine Bufalina Mittel und eine Ortolana Klein',
      expectedState: {
        phase: 'selecting',
        items: [
          { id: 'bufa', name: 'Bufalina',  size: 'M', qty: 1, price: 14 },
          { id: 'orto', name: 'Ortolana',  size: 'S', qty: 1, price: 10 },
        ],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: '1×Bufalina(M)',  label: 'Bufalina M in Bestellung' },
        { type: 'contains', target: 'system', value: '1×Ortolana(S)',  label: 'Ortolana S in Bestellung' },
        { type: 'contains', target: 'system', value: 'Zwischensumme: €24.00', label: 'Zwischensumme €24' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bufalina/i, severity: 'error', label: 'Erwähnt Bufalina' },
        { type: 'regex', value: /ortolana/i, severity: 'error', label: 'Erwähnt Ortolana' },
        { type: 'regex', value: /€\s*24|\b24\b/, severity: 'warning', label: 'Nennt Zwischensumme' },
        { type: 'regex', value: /zone|liefer|wo/i, severity: 'warning', label: 'Fragt auf Deutsch nach Zone' },
      ],
    },
    {
      user: 'Ich bin in der Medio-Zone',
      expectedState: { phase: 'address', zone: 'mid' },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'Zone: Medio', label: 'Zone Medio im Prompt' },
        { type: 'regex', target: 'system', value: /ETA: ~\d+ min/, label: 'ETA berechnet' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestätig/i, severity: 'warning', label: 'Bittet um Bestätigung auf Deutsch' },
      ],
    },
    {
      user: 'Ja, bitte bestätigen',
      expectedState: { phase: 'confirmed', confirmed: true },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'BESTÄTIGT', label: 'Bestätigungsflag gesetzt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /bestell|aufgegeben|bestätig/i, severity: 'error', label: 'Bestätigt auf Deutsch' },
        { type: 'not-contains', value: 'confirmed', severity: 'warning', label: 'Kein englisches "confirmed"' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
  ],
};
