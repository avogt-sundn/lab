import type { OrderState } from '../src/types.js';

export interface PromptAssertion {
  type: 'contains' | 'regex' | 'not-contains';
  target: 'system';
  value: string | RegExp;
  label?: string;
}

export interface ResponseAssertion {
  type: 'contains' | 'regex' | 'not-contains' | 'max-length' | 'min-length';
  value: string | RegExp | number;
  severity: 'error' | 'warning';
  label?: string;
}

export interface StoryTurn {
  user: string;
  expectedState?: Partial<OrderState>;
  promptAssertions?: PromptAssertion[];
  responseAssertions?: ResponseAssertion[];
}

export interface Story {
  id: string;
  title: string;
  description?: string;
  simulatedTime?: Date;
  initialState?: Partial<OrderState>;
  turns: StoryTurn[];
}
