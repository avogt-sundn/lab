import type { StoryResult } from './runner.js';
import type { AssertionResult } from './assertions.js';

const PASS  = '✓';
const FAIL  = '✗';
const WARN  = '⚠';
const RESET = '\x1b[0m';
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW= '\x1b[33m';
const CYAN  = '\x1b[36m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

function c(color: string, s: string) { return `${color}${s}${RESET}`; }

function resultIcon(r: AssertionResult | { passed: boolean; severity?: string }) {
  if (r.passed) return c(GREEN, PASS);
  return r.severity === 'warning' ? c(YELLOW, WARN) : c(RED, FAIL);
}

export function printResults(results: StoryResult[], layer: string): void {
  console.log();
  console.log(c(BOLD, `PizzAI Storybook — layer: ${layer}`));
  console.log(c(DIM, '─'.repeat(60)));

  for (const sr of results) {
    const badge = sr.passed
      ? (sr.hasWarnings ? c(YELLOW, '[WARN]') : c(GREEN, '[PASS]'))
      : c(RED, '[FAIL]');
    console.log(`\n${badge} ${c(BOLD, sr.story.title)}`);
    console.log(c(DIM, `     id: ${sr.story.id}`));

    for (const t of sr.turns) {
      console.log(`\n  ${c(CYAN, `Turn ${t.turnIndex + 1}:`)} ${DIM}${t.user}${RESET}`);

      if (t.stateResult.length) {
        console.log(`    ${c(DIM, 'State:')} `);
        for (const r of t.stateResult) {
          const icon = r.passed ? c(GREEN, PASS) : c(RED, FAIL);
          console.log(`      ${icon} ${r.label}${r.passed ? '' : c(RED, ` (got: ${JSON.stringify(r.actual)})`)}`);
        }
      }

      if (t.promptResults.length) {
        console.log(`    ${c(DIM, 'Prompt:')}`);
        for (const r of t.promptResults) {
          console.log(`      ${resultIcon(r)} ${r.label}`);
        }
      }

      if (t.responseResults.length && t.response !== null) {
        console.log(`    ${c(DIM, 'Response:')} ${DIM}${truncate(t.response, 120)}${RESET}`);
        for (const r of t.responseResults) {
          console.log(`      ${resultIcon(r)} ${r.label}`);
        }
      }

      // Dump system prompt on any failure
      const anyFail = [...t.stateResult, ...t.promptResults, ...t.responseResults]
        .some(r => !r.passed && (r as AssertionResult).severity !== 'warning');
      if (anyFail) {
        console.log(`\n    ${c(RED, '── System prompt dump ──')}`);
        for (const line of t.systemPrompt.split('\n')) {
          console.log(`    ${DIM}${line}${RESET}`);
        }
      }
    }
  }

  console.log();
  console.log(c(DIM, '─'.repeat(60)));
  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const warned  = results.filter(r => r.passed && r.hasWarnings).length;
  const totalErrors   = results.reduce((s, r) => s + r.errorCount, 0);
  const totalWarnings = results.reduce((s, r) => s + r.warningCount, 0);

  console.log(`${c(BOLD, 'Summary:')} ${c(GREEN, `${passed} passed`)}  ${warned ? c(YELLOW, `${warned} warned`) + '  ' : ''}${failed ? c(RED, `${failed} failed`) + '  ' : ''}| errors: ${totalErrors}  warnings: ${totalWarnings}`);
  console.log();
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
