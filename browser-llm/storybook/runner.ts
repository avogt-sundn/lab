import type { Story, StoryTurn } from '../stories/types.js';
import type { OrderState, Message } from '../src/types.js';
import { freshOrder } from '../src/order-state.js';
import { parseUserIntent } from '../src/parse-intent.js';
import { buildSystemPrompt, assembleMessages } from '../src/build-prompt.js';
import { checkPromptAssertion, checkResponseAssertion, type AssertionResult } from './assertions.js';

export type Layer = 'pipeline' | 'inference' | 'both';

export interface TurnResult {
  turnIndex: number;
  user: string;
  systemPrompt: string;
  response: string | null;
  stateResult: { passed: boolean; label: string; actual: unknown; expected: unknown }[];
  promptResults: AssertionResult[];
  responseResults: AssertionResult[];
}

export interface StoryResult {
  story: Story;
  turns: TurnResult[];
  passed: boolean;
  hasWarnings: boolean;
  errorCount: number;
  warningCount: number;
}

export async function runStory(
  story: Story,
  layer: Layer,
  generateFn?: (messages: Message[]) => Promise<string>,
): Promise<StoryResult> {
  const now = story.simulatedTime ?? new Date();
  let state: OrderState = {
    ...(freshOrder()),
    ...(story.initialState ?? {}),
  } as OrderState;

  const history: Message[] = [];
  const turnResults: TurnResult[] = [];

  for (let i = 0; i < story.turns.length; i++) {
    const turn = story.turns[i];

    // 1. Parse intent — state transition
    state = parseUserIntent(turn.user, state);

    // 2. Verify expected state
    const stateResult = checkExpectedState(state, turn);

    // 3. Build system prompt
    const systemPrompt = buildSystemPrompt(state, now);

    // 4. Check prompt assertions
    const promptResults = (turn.promptAssertions ?? []).map(a =>
      checkPromptAssertion(a, systemPrompt)
    );

    // 5. Push user message to history
    history.push({ role: 'user', content: turn.user });

    // 6. Optionally run inference
    let response: string | null = null;
    let responseResults: AssertionResult[] = [];

    if ((layer === 'inference' || layer === 'both') && generateFn) {
      const messages = assembleMessages(state, history.slice(0, -1), now);
      response = await generateFn(messages);
      history.push({ role: 'assistant', content: response });
      responseResults = (turn.responseAssertions ?? []).map(a =>
        checkResponseAssertion(a, response!)
      );
    }

    turnResults.push({ turnIndex: i, user: turn.user, systemPrompt, response, stateResult, promptResults, responseResults });
  }

  const allResults = turnResults.flatMap(t => [...t.stateResult.map(r => ({ ...r, severity: 'pipeline' as const })), ...t.promptResults, ...t.responseResults]);
  const errors = allResults.filter(r => !r.passed && r.severity !== 'warning');
  const warnings = allResults.filter(r => !r.passed && r.severity === 'warning');

  return {
    story,
    turns: turnResults,
    passed: errors.length === 0,
    hasWarnings: warnings.length > 0,
    errorCount: errors.length,
    warningCount: warnings.length,
  };
}

function checkExpectedState(state: OrderState, turn: StoryTurn) {
  if (!turn.expectedState) return [];
  const results = [];
  const exp = turn.expectedState;

  if (exp.phase !== undefined) {
    results.push({ passed: state.phase === exp.phase, label: `phase = "${exp.phase}"`, actual: state.phase, expected: exp.phase });
  }
  if (exp.zone !== undefined) {
    results.push({ passed: state.zone === exp.zone, label: `zone = "${exp.zone}"`, actual: state.zone, expected: exp.zone });
  }
  if (exp.confirmed !== undefined) {
    results.push({ passed: state.confirmed === exp.confirmed, label: `confirmed = ${exp.confirmed}`, actual: state.confirmed, expected: exp.confirmed });
  }
  if (exp.items !== undefined) {
    for (const expItem of exp.items) {
      const found = state.items.find(i => i.id === expItem.id && i.size === expItem.size);
      results.push({
        passed: !!found && found.qty === expItem.qty && found.price === expItem.price,
        label: `item ${expItem.id}(${expItem.size}) qty=${expItem.qty} price=${expItem.price}`,
        actual: found ?? null,
        expected: expItem,
      });
    }
  }
  return results;
}
