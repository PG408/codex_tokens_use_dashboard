import { describe, expect, it } from 'vitest';
import { parseSessionJsonl } from '../parser.js';

const sourceFile = '/tmp/session.jsonl';

const sessionMeta = JSON.stringify({
  timestamp: '2026-06-07T01:00:00.000Z',
  type: 'session_meta',
  payload: {
    id: 'session-a',
    timestamp: '2026-06-07T00:59:00.000Z',
    cwd: '/tmp/project',
    originator: 'Codex Desktop',
    model_provider: 'openai',
    cli_version: '0.137.0'
  }
});

const userMessage = (timestamp: string, text: string): string =>
  JSON.stringify({
    timestamp,
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }]
    }
  });

const tokenCount = (
  timestamp: string,
  lastTotalTokens: number,
  totalTokens: number,
  inputTokens = lastTotalTokens,
  cachedInputTokens = 0,
  outputTokens = 0,
  reasoningOutputTokens = 0
): string =>
  JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: cachedInputTokens,
          output_tokens: outputTokens,
          reasoning_output_tokens: reasoningOutputTokens,
          total_tokens: lastTotalTokens
        },
        total_token_usage: {
          input_tokens: inputTokens,
          cached_input_tokens: cachedInputTokens,
          output_tokens: outputTokens,
          reasoning_output_tokens: reasoningOutputTokens,
          total_tokens: totalTokens
        }
      }
    }
  });

describe('parseSessionJsonl', () => {
  it('groups multiple token calls under one Prompt until the next user input', () => {
    const jsonl = [
      sessionMeta,
      userMessage('2026-06-07T01:00:01.000Z', 'Build the dashboard MVP'),
      tokenCount('2026-06-07T01:00:02.000Z', 120, 120, 100, 40, 20, 5),
      tokenCount('2026-06-07T01:00:03.000Z', 80, 200, 50, 10, 30, 0),
      userMessage('2026-06-07T01:00:04.000Z', 'Filter by session'),
      tokenCount('2026-06-07T01:00:05.000Z', 35, 235, 25, 5, 10, 1)
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.session).toMatchObject({
      sessionId: 'session-a',
      sourceFile,
      startedAt: '2026-06-07T00:59:00.000Z',
      cwd: '/tmp/project',
      originator: 'Codex Desktop',
      modelProvider: 'openai',
      cliVersion: '0.137.0',
      lastSeenAt: '2026-06-07T01:00:05.000Z'
    });
    expect(parsed.prompts).toHaveLength(2);
    expect(parsed.prompts[0]).toMatchObject({
      sessionId: 'session-a',
      startedAt: '2026-06-07T01:00:01.000Z',
      promptPreview: 'Build the dashboard MVP',
      callCount: 2,
      inputTokens: 150,
      cachedInputTokens: 50,
      outputTokens: 50,
      reasoningOutputTokens: 5,
      totalTokens: 200
    });
    expect(parsed.prompts[1]).toMatchObject({
      promptPreview: 'Filter by session',
      callCount: 1,
      totalTokens: 35
    });
    expect(parsed.tokenCalls).toHaveLength(3);
    expect(parsed.tokenCalls.map((call) => call.promptId)).toEqual([
      parsed.prompts[0].promptId,
      parsed.prompts[0].promptId,
      parsed.prompts[1].promptId
    ]);
    expect(parsed.validation).toEqual({
      totalTokenDelta: 235,
      lastReportedTotalTokens: 235
    });
  });

  it('normalizes and truncates Prompt previews without storing full input text', () => {
    const longInput = `${'alpha '.repeat(30)}beta`;
    const jsonl = [
      sessionMeta,
      userMessage('2026-06-07T01:00:01.000Z', `  ${longInput.replaceAll(' ', '\n\t')}  `)
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);
    const serializedPrompts = JSON.stringify(parsed.prompts);

    expect(parsed.prompts[0].promptPreview).toHaveLength(120);
    expect(parsed.prompts[0].promptPreview).not.toContain('\n');
    expect(serializedPrompts).not.toContain(longInput);
    expect(parsed.prompts[0]).not.toHaveProperty('promptText');
    expect(parsed.prompts[0]).not.toHaveProperty('text');
  });

  it('creates an unattributed Prompt for token counts before user input', () => {
    const jsonl = [
      sessionMeta,
      tokenCount('2026-06-07T01:00:01.000Z', 44, 44),
      userMessage('2026-06-07T01:00:02.000Z', 'Now start'),
      tokenCount('2026-06-07T01:00:03.000Z', 11, 55)
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, sourceFile);

    expect(parsed.prompts).toHaveLength(2);
    expect(parsed.prompts[0]).toMatchObject({
      promptPreview: 'unattributed',
      callCount: 1,
      totalTokens: 44
    });
    expect(parsed.prompts[1]).toMatchObject({
      promptPreview: 'Now start',
      callCount: 1,
      totalTokens: 11
    });
  });
});
