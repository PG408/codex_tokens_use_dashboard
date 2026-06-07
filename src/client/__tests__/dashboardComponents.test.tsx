import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardPrompt, DashboardSession } from '../clientTypes.js';
import { PromptComposition } from '../components/PromptComposition.js';
import { PromptTable } from '../components/PromptTable.js';
import { SessionRanking } from '../components/SessionRanking.js';
import { Toolbar } from '../components/Toolbar.js';

const prompt = (id: string, sessionId = 'session-alpha'): DashboardPrompt => ({
  promptId: id,
  sessionId,
  startedAt: '2026-06-07T01:00:00.000Z',
  promptPreview: 'Inspect dashboard controls',
  callCount: 1,
  inputTokens: 100,
  cachedInputTokens: 25,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  totalTokens: 150,
  inputCacheHitRate: 0.25,
  model: 'gpt-5'
});

const session = (id: string): DashboardSession => ({
  sessionId: id,
  sourceFile: `/tmp/${id}.jsonl`,
  startedAt: '2026-06-07T01:00:00.000Z',
  cwd: '/tmp/project',
  originator: 'Codex',
  modelProvider: 'openai',
  cliVersion: '0.137.0',
  lastSeenAt: '2026-06-07T01:10:00.000Z',
  inputTokens: 100,
  cachedInputTokens: 25,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  totalTokens: 150,
  inputCacheHitRate: 0.25
});

describe('dashboard components', () => {
  it('renders prompt session ids as non-clickable text', () => {
    const html = renderToStaticMarkup(
      <PromptTable
        prompts={[prompt('prompt-1')]}
        selectedPromptId="prompt-1"
        sort={{ key: 'totalTokens', direction: 'desc' }}
        onPromptSelect={() => undefined}
        onSortChange={() => undefined}
      />
    );

    expect(html).toContain('session-alpha');
    expect(html).not.toContain('link-button');
  });

  it('renders accurate prompt table footer ranges', () => {
    const renderFooter = (prompts: DashboardPrompt[]) =>
      renderToStaticMarkup(
        <PromptTable
          prompts={prompts}
          selectedPromptId=""
          sort={{ key: 'totalTokens', direction: 'desc' }}
          onPromptSelect={() => undefined}
          onSortChange={() => undefined}
        />
      );

    expect(renderFooter([])).toContain('0 of 0 prompts');
    expect(renderFooter([prompt('prompt-1')])).toContain('1-1 of 1 prompts');
    expect(
      renderFooter(Array.from({ length: 25 }, (_, index) => prompt(`prompt-${index}`)))
    ).toContain('1-20 of 25 prompts');
  });

  it('renders accurate session table footer ranges', () => {
    const renderFooter = (sessions: DashboardSession[]) =>
      renderToStaticMarkup(
        <SessionRanking
          sessions={sessions}
          sort={{ key: 'totalTokens', direction: 'desc' }}
          onSortChange={() => undefined}
        />
      );

    expect(renderFooter([])).toContain('0 of 0 sessions');
    expect(renderFooter([session('session-1')])).toContain('1-1 of 1 sessions');
    expect(
      renderFooter(Array.from({ length: 12 }, (_, index) => session(`session-${index}`)))
    ).toContain('1-10 of 12 sessions');
  });

  it('does not render an inert close icon in the composition rail', () => {
    const html = renderToStaticMarkup(<PromptComposition prompt={null} />);

    expect(html).not.toContain('lucide-x');
  });

  it('renders quick ranges and custom date inputs in the toolbar', () => {
    const html = renderToStaticMarkup(
      <Toolbar
        dateRange={{ from: '2026-06-01', to: '2026-06-07' }}
        isRefreshing={false}
        lastRefreshed="2026-06-07T01:00:00.000Z"
        searchTerm=""
        selectedSessionId=""
        sessionOptions={[]}
        timeRange="custom"
        onDateRangeChange={() => undefined}
        onRefresh={() => undefined}
        onSearchTermChange={() => undefined}
        onSessionChange={() => undefined}
        onTimeRangeChange={() => undefined}
      />
    );

    expect(html).toContain('Quick time ranges');
    expect(html).toContain('Today');
    expect(html).toContain('90D');
    expect(html).toContain('Custom');
    expect(html).toContain('type="date"');
    expect(html).toContain('2026-06-01');
    expect(html).toContain('2026-06-07');
  });
});
