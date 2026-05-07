export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  prices: { S: number; M: number; L: number };
  prep: number;
}

export interface Zone {
  id: string;
  label: string;
  mins: number;
  fee: number;
}

export interface Business {
  openHour: number;
  closeHour: number;
  lastOrderMinsBefore: number;
  peakHours: number[];
  peakMultiplier: number;
  minFreeDelivery: number;
  totalDrivers: number;
}

export interface OrderItem {
  id: string;
  name: string;
  size: 'S' | 'M' | 'L';
  qty: number;
  price: number;
}

export type OrderPhase = 'browsing' | 'selecting' | 'address' | 'confirmed';

export interface OrderState {
  phase: OrderPhase;
  items: OrderItem[];
  zone: string | null;
  confirmed: boolean;
}

export interface DriverState {
  available: number;
  nextFreeIn: number;
}

export interface DeliveryEstimate {
  prep: number;
  delivery: number;
  driverWait: number;
  total: number;
  fee: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
