import { describe, expect, it } from 'vitest';
import { createDashboardStore } from '../store.js';
import type { ParsedSession } from '../../shared/types.js';

const parsedSession = (
  sessionId: string,
  totalTokens: number,
  promptPreview = `${sessionId} dashboard analysis`
): ParsedSession => ({
  session: {
    sessionId,
    sourceFile: `/tmp/${sessionId}.jsonl`,
    startedAt: '2026-06-07T00:00:00.000Z',
    cwd: `/tmp/${sessionId}`,
    originator: 'Codex Desktop',
    modelProvider: 'openai',
    cliVersion: '0.137.0',
    lastSeenAt: '2026-06-07T00:15:00.000Z'
  },
  prompts: [
    {
      promptId: `${sessionId}:prompt-1`,
      sessionId,
      startedAt: '2026-06-07T00:05:00.000Z',
      promptPreview,
      callCount: 2,
      inputTokens: totalTokens === 300 ? 120 : 0,
      cachedInputTokens: totalTokens === 300 ? 60 : 0,
      outputTokens: totalTokens === 300 ? 90 : 40,
      reasoningOutputTokens: totalTokens === 300 ? 30 : 10,
      totalTokens
    },
    {
      promptId: `${sessionId}:unattributed`,
      sessionId,
      startedAt: '2026-06-07T00:01:00.000Z',
      promptPreview: 'unattributed',
      callCount: 1,
      inputTokens: 20,
      cachedInputTokens: 5,
      outputTokens: 5,
      reasoningOutputTokens: 0,
      totalTokens: 30
    }
  ],
  tokenCalls: [
    {
      callId: `${sessionId}:call-1`,
      sessionId,
      promptId: `${sessionId}:prompt-1`,
      occurredAt: '2026-06-07T00:06:00.000Z',
      inputTokens: totalTokens === 300 ? 80 : 0,
      cachedInputTokens: totalTokens === 300 ? 40 : 0,
      outputTokens: totalTokens === 300 ? 60 : 40,
      reasoningOutputTokens: totalTokens === 300 ? 20 : 10,
      totalTokens: totalTokens === 300 ? 200 : totalTokens
    },
    {
      callId: `${sessionId}:call-2`,
      sessionId,
      promptId: `${sessionId}:prompt-1`,
      occurredAt: '2026-06-08T00:06:00.000Z',
      inputTokens: totalTokens === 300 ? 40 : 0,
      cachedInputTokens: totalTokens === 300 ? 20 : 0,
      outputTokens: totalTokens === 300 ? 30 : 0,
      reasoningOutputTokens: totalTokens === 300 ? 10 : 0,
      totalTokens: totalTokens === 300 ? 100 : 0
    },
    {
      callId: `${sessionId}:call-unattributed`,
      sessionId,
      promptId: `${sessionId}:unattributed`,
      occurredAt: '2026-06-07T00:02:00.000Z',
      inputTokens: 20,
      cachedInputTokens: 5,
      outputTokens: 5,
      reasoningOutputTokens: 0,
      totalTokens: 30
    }
  ],
  validation: {
    totalTokenDelta: totalTokens + 30,
    lastReportedTotalTokens: totalTokens + 30
  }
});

describe('dashboard store', () => {
  it('returns KPI, session, trend, and Prompt aggregates', async () => {
    const store = await createDashboardStore();

    store.replaceAll(parsedSession('session-a', 300), parsedSession('session-b', 50));
    const dashboard = store.getDashboardData({});

    expect(dashboard.kpis).toEqual({
      inputTokens: 160,
      cachedInputTokens: 70,
      outputTokens: 140,
      reasoningOutputTokens: 40,
      totalTokens: 410,
      inputCacheHitRate: 70 / 160,
      sessionCount: 2,
      promptCount: 2
    });
    expect(dashboard.sessions.map((session) => session.sessionId)).toEqual([
      'session-a',
      'session-b'
    ]);
    expect(dashboard.sessions[0]).toMatchObject({
      inputTokens: 140,
      cachedInputTokens: 65,
      totalTokens: 330,
      inputCacheHitRate: 65 / 140
    });
    expect(dashboard.trend).toEqual([
      {
        bucket: '2026-06-07',
        inputTokens: 120,
        cachedInputTokens: 50,
        outputTokens: 110,
        reasoningOutputTokens: 30,
        totalTokens: 310,
        inputCacheHitRate: 50 / 120
      },
      {
        bucket: '2026-06-08',
        inputTokens: 40,
        cachedInputTokens: 20,
        outputTokens: 30,
        reasoningOutputTokens: 10,
        totalTokens: 100,
        inputCacheHitRate: 0.5
      }
    ]);
    expect(dashboard.prompts.map((prompt) => prompt.promptPreview)).toEqual([
      'session-a dashboard analysis',
      'session-b dashboard analysis'
    ]);
    expect(dashboard.prompts[0]).toMatchObject({
      totalTokens: 300,
      inputCacheHitRate: 0.5,
      model: 'openai'
    });
  });

  it('deduplicates repeated rollout snapshots for the same session', async () => {
    const store = await createDashboardStore();

    store.replaceAll(parsedSession('session-a', 50), parsedSession('session-a', 300));
    const dashboard = store.getDashboardData({});

    expect(dashboard.kpis.totalTokens).toBe(330);
    expect(dashboard.sessions).toHaveLength(1);
    expect(dashboard.prompts.map((prompt) => prompt.promptPreview)).toEqual([
      'session-a dashboard analysis'
    ]);
  });

  it('namespaces Prompt and token call ids by their final session', async () => {
    const store = await createDashboardStore();
    const first = parsedSession('session-a', 50);
    const second = parsedSession('session-b', 300);
    second.prompts[0].promptId = first.prompts[0].promptId;
    second.tokenCalls[0].callId = first.tokenCalls[0].callId;
    second.tokenCalls[0].promptId = first.prompts[0].promptId;
    second.tokenCalls[1].promptId = first.prompts[0].promptId;

    store.replaceAll(first, second);
    const dashboard = store.getDashboardData({});

    expect(dashboard.kpis.totalTokens).toBe(410);
    expect(dashboard.sessions).toHaveLength(2);
    expect(dashboard.prompts).toHaveLength(2);
  });

  it('returns null cache hit rate when input tokens are zero', async () => {
    const store = await createDashboardStore();

    store.replaceAll(parsedSession('session-b', 50));
    const dashboard = store.getDashboardData({
      sessionId: 'session-b',
      q: 'dashboard'
    });

    expect(dashboard.kpis.inputTokens).toBe(0);
    expect(dashboard.kpis.inputCacheHitRate).toBeNull();
    expect(dashboard.sessions[0].inputCacheHitRate).toBeNull();
    expect(dashboard.prompts[0].inputCacheHitRate).toBeNull();
  });

  it('filters by session, date range, and Prompt preview search', async () => {
    const store = await createDashboardStore();

    store.replaceAll(parsedSession('session-a', 300), parsedSession('session-b', 50));
    const dashboard = store.getDashboardData({
      from: '2026-06-08T00:00:00.000Z',
      to: '2026-06-08T23:59:59.999Z',
      sessionId: 'session-a',
      q: 'analysis'
    });

    expect(dashboard.kpis.totalTokens).toBe(100);
    expect(dashboard.sessions).toHaveLength(1);
    expect(dashboard.sessions[0].sessionId).toBe('session-a');
    expect(dashboard.trend).toHaveLength(1);
    expect(dashboard.trend[0].bucket).toBe('2026-06-08');
    expect(dashboard.prompts).toHaveLength(1);
    expect(dashboard.prompts[0].promptId).toBe('session-a:prompt-1');
  });

  it('treats date-only to filters as the end of that UTC day', async () => {
    const store = await createDashboardStore();

    store.replaceAll(parsedSession('session-a', 300));
    const dashboard = store.getDashboardData({
      to: '2026-06-08',
      sessionId: 'session-a',
      q: 'analysis'
    });

    expect(dashboard.kpis.totalTokens).toBe(300);
    expect(dashboard.trend.map((bucket) => bucket.bucket)).toEqual([
      '2026-06-07',
      '2026-06-08'
    ]);
  });

  it('includes only the requested UTC day for same-day date-only ranges', async () => {
    const store = await createDashboardStore();

    store.replaceAll(parsedSession('session-a', 300));
    const dashboard = store.getDashboardData({
      from: '2026-06-08',
      to: '2026-06-08',
      sessionId: 'session-a',
      q: 'analysis'
    });

    expect(dashboard.kpis.totalTokens).toBe(100);
    expect(dashboard.trend).toHaveLength(1);
    expect(dashboard.trend[0]).toMatchObject({
      bucket: '2026-06-08',
      totalTokens: 100
    });
    expect(dashboard.prompts[0]).toMatchObject({
      promptId: 'session-a:prompt-1',
      totalTokens: 100
    });
  });

  it('searches Prompt previews with literal percent and underscore characters', async () => {
    const store = await createDashboardStore();

    store.replaceAll(
      parsedSession('session-a', 300),
      parsedSession('session-special', 70, 'literal 100%_match')
    );
    const dashboard = store.getDashboardData({ q: '%' });

    expect(dashboard.kpis.totalTokens).toBe(70);
    expect(dashboard.prompts.map((prompt) => prompt.promptPreview)).toEqual([
      'literal 100%_match'
    ]);
  });
});
