import type { Story } from './types.js';

export const story: Story = {
  id: 'geschlossen-nachts',
  title: 'Bestellversuch außerhalb der Öffnungszeiten (23:00)',
  simulatedTime: new Date('2026-05-07T23:00:00'),

  turns: [
    {
      user: 'Ich hätte gerne eine Diavola',
      expectedState: {
        phase: 'selecting',
        items: [{ id: 'diav', name: 'Diavola', size: 'M', qty: 1, price: 13 }],
      },
      promptAssertions: [
        { type: 'contains', target: 'system', value: 'GESCHLOSSEN', label: 'GESCHLOSSEN um 23:00' },
        { type: 'not-contains', target: 'system', value: 'OFFEN', label: 'Nicht OFFEN' },
        { type: 'contains', target: 'system', value: '11:00', label: 'Öffnungszeit im Prompt' },
      ],
      responseAssertions: [
        { type: 'regex', value: /geschlossen|tut mir leid|entschuldig|leider/i, severity: 'error', label: 'Erwähnt Schließung oder entschuldigt sich' },
        { type: 'regex', value: /11(:00)?|öffn/i, severity: 'warning', label: 'Nennt Öffnungszeiten' },
        { type: 'not-contains', value: 'bestätigen', severity: 'warning', label: 'Bietet keine Bestätigung an' },
        { type: 'max-length', value: 600, severity: 'warning', label: 'Kurze Antwort' },
      ],
    },
  ],
};
