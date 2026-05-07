import type { MenuItem, Zone, Business } from './types.js';

export const MENU: MenuItem[] = [
  { id: 'marg',   name: 'Margherita',      desc: 'tomato, mozzarella, basil',                tags: ['V'],       prices: { S: 8,  M: 11, L: 14 }, prep: 10 },
  { id: 'diav',   name: 'Diavola',         desc: 'spicy salami, tomato, mozzarella',         tags: [],          prices: { S: 10, M: 13, L: 16 }, prep: 12 },
  { id: 'quat',   name: 'Quattro Stagioni',desc: 'ham, artichoke, mushroom, olive',          tags: [],          prices: { S: 11, M: 14, L: 17 }, prep: 14 },
  { id: 'orto',   name: 'Ortolana',        desc: 'grilled zucchini, peppers, aubergine',     tags: ['V', 'VG'], prices: { S: 10, M: 13, L: 16 }, prep: 12 },
  { id: 'napo',   name: 'Napoletana',      desc: 'anchovy, caper, olive, tomato',            tags: [],          prices: { S: 9,  M: 12, L: 15 }, prep: 10 },
  { id: 'fung',   name: 'Funghi',          desc: 'mixed mushrooms, truffle oil, mozzarella', tags: ['V'],       prices: { S: 9,  M: 12, L: 15 }, prep: 11 },
  { id: 'bufa',   name: 'Bufalina',        desc: 'buffalo mozzarella, cherry tomato, basil', tags: ['V'],       prices: { S: 11, M: 14, L: 17 }, prep: 10 },
  { id: 'cala',   name: 'Calabrese',       desc: 'nduja, red onion, provola',                tags: [],          prices: { S: 10, M: 13, L: 16 }, prep: 12 },
  { id: 'gfmarg', name: 'Margherita GF',   desc: 'GF base, tomato, mozzarella, basil',       tags: ['V', 'GF'], prices: { S: 10, M: 13, L: 16 }, prep: 13 },
  { id: 'green',  name: 'Green Garden',    desc: 'GF base, cashew cream, spinach, artichoke',tags: ['VG', 'GF'],prices: { S: 12, M: 15, L: 18 }, prep: 15 },
];

export const ZONES: Zone[] = [
  { id: 'near', label: 'Centro (< 2 km)',    mins: 10, fee: 0 },
  { id: 'mid',  label: 'Medio (2–5 km)',     mins: 20, fee: 2 },
  { id: 'far',  label: 'Periferia (5–8 km)', mins: 30, fee: 4 },
];

export const BUSINESS: Business = {
  openHour: 11, closeHour: 22, lastOrderMinsBefore: 30,
  peakHours: [12, 13, 19, 20, 21], peakMultiplier: 1.4,
  minFreeDelivery: 25, totalDrivers: 4,
};

export const DAILY_SPECIALS: string[] = [
  'Sonntag: **Margherita** Medium zum Klein-Preis',
  'Montag: **Funghi** — kostenloses Trüffelöl-Upgrade',
  'Dienstag: **Diavola** — 2-für-1 bei Groß',
  'Mittwoch: **Ortolana** — €2 Rabatt auf alle Größen',
  'Donnerstag: **Bufalina** — kostenloser Größenaufstieg S→M',
  'Freitag: **Calabrese** — kostenloses Knoblauchbrot',
  'Samstag: **Quattro Stagioni** Groß — €3 Rabatt',
];
