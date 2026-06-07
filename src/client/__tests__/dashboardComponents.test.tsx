import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardPrompt, DashboardSession } from '../clientTypes.js';
import {
  PromptComposition,
  type TokenCompositionContext
} from '../components/PromptComposition.js';
import { PromptTable } from '../components/PromptTable.js';
import { SessionRanking } from '../components/SessionRanking.js';
import { Toolbar } from '../components/Toolbar.js';

const prompt = (id: string, sessionId = 'session-alpha'): DashboardPrompt => ({
  promptId: id,
  sessionId,
  startedAt: '2026-06-07T01:00:00.000Z',
  promptPreview: 'Inspect dashboard controls',
  callCount: 1,
  cwd: '/tmp/project-alpha',
  inputTokens: 100,
  cachedInputTokens: 25,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  totalTokens: 150,
  inputCacheHitRate: 0.25,
  model: 'gpt-5.5',
  modelEffort: 'high',
  modelContextWindow: 258400,
  inputSources: [
    {
      sourceId: 'user_prompt:User prompt',
      category: 'user_prompt',
      label: 'User prompt',
      chars: 120,
      events: 1,
      confidence: 'high',
      estimatedTokens: 70,
      share: 0.7
    },
    {
      sourceId: 'tool_outputs:Tool output: exec_command',
      category: 'tool_outputs',
      label: 'Tool output: exec_command',
      chars: 50,
      events: 1,
      confidence: 'high',
      estimatedTokens: 30,
      share: 0.3
    }
  ]
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

const promptCompositionContext = (): TokenCompositionContext => {
  const selectedPrompt = prompt('prompt-1');
  return {
    kind: 'prompt',
    titleLabel: 'Selected prompt',
    title: 'Jun 7, 1:00 AM',
    details: [
      { label: 'Session', value: selectedPrompt.sessionId },
      { label: 'Model', value: 'gpt-5.5 / high' },
      { label: 'Context window', value: '258.4K' }
    ],
    usage: {
      inputTokens: selectedPrompt.inputTokens,
      cachedInputTokens: selectedPrompt.cachedInputTokens,
      outputTokens: selectedPrompt.outputTokens,
      reasoningOutputTokens: selectedPrompt.reasoningOutputTokens,
      totalTokens: selectedPrompt.totalTokens
    },
    inputCacheHitRate: selectedPrompt.inputCacheHitRate,
    inputSources: selectedPrompt.inputSources
  };
};

describe('dashboard components', () => {
  it('renders project names and copyable detail tooltips in prompt rows', () => {
    const html = renderToStaticMarkup(
      <PromptTable
        prompts={[prompt('prompt-1')]}
        selectedPromptId="prompt-1"
        sort={{ key: 'totalTokens', direction: 'desc' }}
        onPromptSelect={() => undefined}
        onSortChange={() => undefined}
      />
    );

    expect(html).toContain('project-alpha');
    expect(html).toContain('gpt-5.5 / high');
    expect(html).toContain('session-alpha');
    expect(html).toContain('session-id-tooltip');
    expect(html).toContain('prompt-preview-text');
    expect(html).toContain('prompt-preview-tooltip');
    expect(html).not.toContain('link-button');
  });

  it('renders project names and full session id tooltips in session ranking rows', () => {
    const html = renderToStaticMarkup(
      <SessionRanking
        sessions={[session('session-alpha-long-id')]}
        selectedSessionId="session-alpha-long-id"
        sort={{ key: 'totalTokens', direction: 'desc' }}
        onSessionSelect={() => undefined}
        onSortChange={() => undefined}
      />
    );

    expect(html).toContain('project');
    expect(html).toContain('session-alpha-long-id');
    expect(html).toContain('session-id-tooltip');
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
          selectedSessionId=""
          sort={{ key: 'totalTokens', direction: 'desc' }}
          onSessionSelect={() => undefined}
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
    const html = renderToStaticMarkup(<PromptComposition context={null} />);

    expect(html).not.toContain('lucide-x');
  });

  it('renders model effort and context window in the composition rail', () => {
    const html = renderToStaticMarkup(
      <PromptComposition context={promptCompositionContext()} />
    );

    expect(html).toContain('gpt-5.5 / high');
    expect(html).toContain('Context window');
    expect(html).toContain('258.4K');
    expect(html).toContain('Token type contribution');
    expect(html).toContain('Input source contribution');
    expect(html).toContain('User input');
    expect(html).toContain('Tool context');
    expect(html).toContain('Drill down');
    expect(html).toContain('Estimated from visible JSONL context');
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
