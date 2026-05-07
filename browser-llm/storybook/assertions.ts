import type { PromptAssertion, ResponseAssertion } from '../stories/types.js';

export interface AssertionResult {
  label: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'pipeline';
  actual?: string;
}

export function checkPromptAssertion(a: PromptAssertion, systemPrompt: string): AssertionResult {
  const text = systemPrompt;
  const label = a.label ?? `${a.type} "${String(a.value).slice(0, 40)}"`;
  let passed: boolean;

  if (a.type === 'contains') {
    passed = text.includes(a.value as string);
  } else if (a.type === 'not-contains') {
    passed = !text.includes(a.value as string);
  } else {
    const re = a.value instanceof RegExp ? a.value : new RegExp(a.value as string);
    passed = re.test(text);
  }

  return { label, passed, severity: 'pipeline' };
}

export function checkResponseAssertion(a: ResponseAssertion, response: string): AssertionResult {
  const label = a.label ?? `${a.type} "${String(a.value).slice(0, 40)}"`;
  let passed: boolean;

  switch (a.type) {
    case 'contains':
      passed = response.includes(a.value as string); break;
    case 'not-contains':
      passed = !response.includes(a.value as string); break;
    case 'regex': {
      const re = a.value instanceof RegExp ? a.value : new RegExp(a.value as string);
      passed = re.test(response); break;
    }
    case 'max-length':
      passed = response.length <= (a.value as number); break;
    case 'min-length':
      passed = response.length >= (a.value as number); break;
    default:
      passed = false;
  }

  return { label, passed, severity: a.severity };
}
