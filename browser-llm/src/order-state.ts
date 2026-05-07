import type { OrderState, DeliveryEstimate, DriverState } from './types.js';
import { MENU, ZONES, BUSINESS } from './constants.js';

export function freshOrder(): OrderState {
  return { phase: 'browsing', items: [], zone: null, confirmed: false };
}

export function orderSubtotal(state: OrderState): number {
  return state.items.reduce((s, i) => s + i.price * i.qty, 0);
}

export function getDriverState(now: Date): DriverState {
  const seed = now.getHours() * 60 + now.getMinutes();
  const available = Math.max(1, BUSINESS.totalDrivers - Math.floor((seed % 7) / 2));
  const nextFreeIn = available < BUSINESS.totalDrivers ? 5 + (seed % 18) : 0;
  return { available, nextFreeIn };
}

export function isOpen(now: Date): boolean {
  const h = now.getHours(), m = now.getMinutes();
  if (h < BUSINESS.openHour) return false;
  if (h >= BUSINESS.closeHour) return false;
  if (h === BUSINESS.closeHour - 1 && m >= (60 - BUSINESS.lastOrderMinsBefore)) return false;
  return true;
}

export function isPeak(now: Date): boolean {
  return BUSINESS.peakHours.includes(now.getHours());
}

export function calculateEstimate(state: OrderState, now: Date): DeliveryEstimate | null {
  if (!state.items.length || !state.zone) return null;
  const mult = isPeak(now) ? BUSINESS.peakMultiplier : 1.0;
  const prepTimes = state.items.map(i => {
    const pizza = MENU.find(m => m.id === i.id);
    return (pizza?.prep ?? 12) * mult;
  });
  const maxPrep = Math.max(...prepTimes);
  const totalQty = state.items.reduce((s, i) => s + i.qty, 0);
  const extraPizzas = Math.max(0, totalQty - 3);
  const prepMins = Math.ceil(maxPrep + extraPizzas * 3);
  const zone = ZONES.find(z => z.id === state.zone)!;
  const drivers = getDriverState(now);
  const driverWait = drivers.available > 0 ? 0 : drivers.nextFreeIn;
  return { prep: prepMins, delivery: zone.mins, driverWait, total: prepMins + zone.mins + driverWait, fee: zone.fee };
}
