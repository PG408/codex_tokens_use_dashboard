import {
  AlertCircle,
  ChartPie,
  CheckCircle2,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Home,
  Moon
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardData } from '../shared/types.js';
import type {
  DateRange,
  DashboardPrompt,
  DashboardSession,
  PromptSortKey,
  SessionSortKey,
  SortDirection,
  SortState,
  TimeRange
} from './clientTypes.js';
import { KpiStrip } from './components/KpiStrip.js';
import {
  PromptComposition,
  type TokenCompositionContext
} from './components/PromptComposition.js';
import { PromptTable } from './components/PromptTable.js';
import { SessionRanking } from './components/SessionRanking.js';
import { Toolbar } from './components/Toolbar.js';
import { UsageCharts } from './components/UsageCharts.js';
import { formatDateTime, formatNumber } from './formatters.js';
import { projectNameFromCwd } from './sessionDisplay.js';

const emptyDashboard: DashboardData = {
  refreshedAt: '',
  kpis: {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    inputCacheHitRate: null,
    sessionCount: 0,
    promptCount: 0
  },
  trend: [],
  sessions: [],
  prompts: []
};

const navItems = [
  { label: 'Overview', href: '#overview', icon: Home },
  { label: 'Sessions', href: '#sessions', icon: ClipboardList },
  { label: 'Prompts', href: '#prompts', icon: FileText },
  { label: 'Token Composition', href: '#composition', icon: ChartPie }
];

const navHrefFromHash = (): string => {
  if (typeof window === 'undefined') {
    return '#overview';
  }

  return navItems.some((item) => item.href === window.location.hash)
    ? window.location.hash
    : '#overview';
};

const dateString = (date: Date): string => date.toISOString().slice(0, 10);

const setDateRangeParams = (
  params: URLSearchParams,
  dateRange: DateRange
): void => {
  if (dateRange.from) {
    params.set('from', dateRange.from);
  }
  if (dateRange.to) {
    params.set('to', dateRange.to);
  }
};

export const timeRangeToQuery = (
  timeRange: TimeRange,
  dateRange: DateRange
): URLSearchParams => {
  const params = new URLSearchParams();
  if (timeRange === 'all') {
    return params;
  }

  if (timeRange === 'custom') {
    setDateRangeParams(params, dateRange);
    return params;
  }

  const daysByRange: Record<Exclude<TimeRange, 'all' | 'custom'>, number> = {
    today: 1,
    '7d': 7,
    '30d': 30,
    '90d': 90
  };
  const days = daysByRange[timeRange];
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (days - 1));
  params.set('from', dateString(from));
  params.set('to', dateString(to));
  return params;
};

export const dashboardQuery = (
  timeRange: TimeRange,
  dateRange: DateRange
): string => {
  const params = timeRangeToQuery(timeRange, dateRange);
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const shouldLoadBootstrapCatchUpQuery = (
  completedRefreshQuery: string,
  currentQuery: string
): boolean => completedRefreshQuery !== currentQuery;

const compareNullableNumber = (
  left: number | null,
  right: number | null
): number => {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return left - right;
};

const sortRows = <T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  direction: SortDirection
): T[] => {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    const result =
      typeof leftValue === 'number' || leftValue === null
        ? compareNullableNumber(
            leftValue as number | null,
            rightValue as number | null
          )
        : String(leftValue).localeCompare(String(rightValue));
    return result * multiplier;
  });
};

const tokenUsageFrom = ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens,
  totalTokens
}: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}) => ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens,
  totalTokens
});

const modelLabel = (prompt: DashboardPrompt): string => {
  const model = prompt.model || 'unknown';
  return prompt.modelEffort ? `${model} / ${prompt.modelEffort}` : model;
};

const aggregateInputSources = (
  prompts: DashboardPrompt[],
  inputTokens: number
): DashboardPrompt['inputSources'] => {
  const sources = new Map<string, DashboardPrompt['inputSources'][number]>();

  prompts.forEach((prompt) => {
    prompt.inputSources.forEach((source) => {
      const existing = sources.get(source.sourceId);
      sources.set(source.sourceId, {
        ...source,
        chars: (existing?.chars ?? 0) + source.chars,
        events: (existing?.events ?? 0) + source.events,
        estimatedTokens:
          (existing?.estimatedTokens ?? 0) + source.estimatedTokens,
        share: 0
      });
    });
  });

  const totalEstimatedTokens = [...sources.values()].reduce(
    (sum, source) => sum + source.estimatedTokens,
    0
  );
  const shareDenominator = inputTokens > 0 ? inputTokens : totalEstimatedTokens;

  return [...sources.values()]
    .map((source) => ({
      ...source,
      share:
        shareDenominator > 0 ? source.estimatedTokens / shareDenominator : 0
    }))
    .sort((left, right) => right.estimatedTokens - left.estimatedTokens);
};

export const App = () => {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [activeNavHref, setActiveNavHref] = useState(navHrefFromHash);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [promptSort, setPromptSort] = useState<SortState<PromptSortKey>>({
    key: 'totalTokens',
    direction: 'desc'
  });
  const [sessionSort, setSessionSort] = useState<SortState<SessionSortKey>>({
    key: 'totalTokens',
    direction: 'desc'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasStartedBootstrap = useRef(false);
  const hasCompletedBootstrap = useRef(false);
  const latestRequestId = useRef(0);
  const activeRefreshRequestId = useRef(0);
  const activeAbortController = useRef<AbortController | null>(null);
  const currentQueryRef = useRef('');

  const query = useMemo(
    () => dashboardQuery(timeRange, dateRange),
    [timeRange, dateRange]
  );
  currentQueryRef.current = query;

  const loadDashboard = useCallback(
    async (mode: 'get' | 'refresh', queryOverride?: string) => {
      const isRefresh = mode === 'refresh';
      const requestQuery = queryOverride ?? query;
      const requestId = latestRequestId.current + 1;
      const abortController = new AbortController();
      latestRequestId.current = requestId;
      activeAbortController.current?.abort();
      activeAbortController.current = abortController;

      setError(null);
      setIsLoading(true);
      if (isRefresh) {
        activeRefreshRequestId.current = requestId;
        setIsRefreshing(true);
      }

      try {
        const endpoint = isRefresh
          ? `/api/refresh${requestQuery}`
          : `/api/dashboard${requestQuery}`;
        const response = await fetch(endpoint, {
          method: isRefresh ? 'POST' : 'GET',
          signal: abortController.signal
        });
        if (!response.ok) {
          throw new Error(`API request failed with ${response.status}`);
        }
        const nextDashboard = (await response.json()) as DashboardData;
        if (latestRequestId.current !== requestId) {
          return;
        }

        setDashboard(nextDashboard);
        setSelectedPromptId((current) => {
          if (nextDashboard.prompts.some((prompt) => prompt.promptId === current)) {
            return current;
          }
          return '';
        });
        setSelectedSessionId((current) => {
          if (nextDashboard.sessions.some((session) => session.sessionId === current)) {
            return current;
          }
          return '';
        });
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return;
        }
        if (latestRequestId.current !== requestId) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load dashboard data'
        );
      } finally {
        let shouldLoadCatchUpQuery = false;
        if (activeAbortController.current === abortController) {
          activeAbortController.current = null;
        }
        if (latestRequestId.current === requestId) {
          setIsLoading(false);
        }
        if (isRefresh && activeRefreshRequestId.current === requestId) {
          setIsRefreshing(false);
          if (!hasCompletedBootstrap.current) {
            hasCompletedBootstrap.current = true;
            shouldLoadCatchUpQuery = shouldLoadBootstrapCatchUpQuery(
              requestQuery,
              currentQueryRef.current
            );
          }
        }
        if (shouldLoadCatchUpQuery) {
          void loadDashboard('get', currentQueryRef.current);
        }
      }
    },
    [query]
  );

  useEffect(() => {
    setSelectedPromptId('');
    setSelectedSessionId('');
    if (!hasStartedBootstrap.current) {
      hasStartedBootstrap.current = true;
      void loadDashboard('refresh');
      return;
    }
    if (!hasCompletedBootstrap.current) {
      return;
    }
    void loadDashboard('get');
  }, [loadDashboard]);

  useEffect(
    () => () => {
      activeAbortController.current?.abort();
    },
    []
  );

  useEffect(() => {
    const syncActiveNav = () => setActiveNavHref(navHrefFromHash());
    syncActiveNav();
    window.addEventListener('hashchange', syncActiveNav);
    return () => window.removeEventListener('hashchange', syncActiveNav);
  }, []);

  const sortedPrompts = useMemo(
    () => sortRows(dashboard.prompts, promptSort.key, promptSort.direction),
    [dashboard.prompts, promptSort]
  );

  const sortedSessions = useMemo(
    () => sortRows(dashboard.sessions, sessionSort.key, sessionSort.direction),
    [dashboard.sessions, sessionSort]
  );

  const selectedPrompt =
    sortedPrompts.find((prompt) => prompt.promptId === selectedPromptId) ?? null;
  const selectedSession =
    sortedSessions.find((session) => session.sessionId === selectedSessionId) ??
    null;
  const compositionContext = useMemo<TokenCompositionContext | null>(() => {
    if (selectedPrompt) {
      return {
        kind: 'prompt',
        titleLabel: 'Selected prompt',
        title: formatDateTime(selectedPrompt.startedAt),
        details: [
          { label: 'Session', value: selectedPrompt.sessionId },
          { label: 'Model', value: modelLabel(selectedPrompt) },
          ...(selectedPrompt.modelContextWindow > 0
            ? [
                {
                  label: 'Context window',
                  value: formatNumber(selectedPrompt.modelContextWindow)
                }
              ]
            : [])
        ],
        usage: tokenUsageFrom(selectedPrompt),
        inputCacheHitRate: selectedPrompt.inputCacheHitRate,
        inputSources: selectedPrompt.inputSources
      };
    }

    if (selectedSession) {
      const sessionPrompts = dashboard.prompts.filter(
        (prompt) => prompt.sessionId === selectedSession.sessionId
      );
      return {
        kind: 'session',
        titleLabel: 'Selected session',
        title: selectedSession.sessionId,
        details: [
          { label: 'Project', value: projectNameFromCwd(selectedSession.cwd) },
          { label: 'Prompts', value: formatNumber(sessionPrompts.length) }
        ],
        usage: tokenUsageFrom(selectedSession),
        inputCacheHitRate: selectedSession.inputCacheHitRate,
        inputSources: aggregateInputSources(sessionPrompts, selectedSession.inputTokens)
      };
    }

    return {
      kind: 'summary',
      titleLabel: 'Scope',
      title: 'Current filter summary',
      details: [
        { label: 'Sessions', value: formatNumber(dashboard.kpis.sessionCount) },
        { label: 'Prompts', value: formatNumber(dashboard.kpis.promptCount) }
      ],
      usage: tokenUsageFrom(dashboard.kpis),
      inputCacheHitRate: dashboard.kpis.inputCacheHitRate,
      inputSources: aggregateInputSources(dashboard.prompts, dashboard.kpis.inputTokens)
    };
  }, [dashboard, selectedPrompt, selectedSession]);
  const hasDashboardData =
    dashboard.trend.length > 0 ||
    dashboard.sessions.length > 0 ||
    dashboard.prompts.length > 0 ||
    dashboard.kpis.totalTokens > 0;

  const changePromptSort = (key: PromptSortKey) => {
    setPromptSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const selectPrompt = (promptId: string) => {
    setSelectedSessionId('');
    setSelectedPromptId((current) => (current === promptId ? '' : promptId));
  };

  const selectSession = (nextSessionId: string) => {
    setSelectedPromptId('');
    setSelectedSessionId((current) =>
      current === nextSessionId ? '' : nextSessionId
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Code2 size={24} aria-hidden="true" />
          <span>Codex Token Monitor</span>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <a
              className={`nav-item${
                item.href === activeNavHref ? ' nav-item-active' : ''
              }`}
              href={item.href}
              key={item.label}
              aria-current={item.href === activeNavHref ? 'page' : undefined}
            >
              <item.icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-meta">
          <div className="meta-block">
            <span className="meta-label">Data source</span>
            <strong>Codex sessions</strong>
            <span>~/.codex/sessions/**</span>
          </div>
          <div className="meta-block">
            <span className="meta-label">Status</span>
            <strong className="status-line">
              <span className="status-dot" />
              {error ? 'Needs attention' : 'Up to date'}
            </strong>
          </div>
          <div className="theme-status">
            <Moon size={16} aria-hidden="true" />
            <span>Light mode</span>
          </div>
        </div>
      </aside>

      <main className="dashboard">
        <header className="page-header" id="overview">
          <h1>Overview</h1>
          {error ? (
            <div className="error-banner" role="status">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="ok-banner" role="status">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Local data boundary preserved</span>
            </div>
          )}
        </header>

        <Toolbar
          isRefreshing={isRefreshing}
          dateRange={dateRange}
          lastRefreshed={dashboard.refreshedAt}
          timeRange={timeRange}
          onDateRangeChange={setDateRange}
          onRefresh={() => void loadDashboard('refresh')}
          onTimeRangeChange={setTimeRange}
        />

        {isLoading && !hasDashboardData ? (
          <section className="empty-state">
            <Database size={20} aria-hidden="true" />
            <div>
              <strong>Loading Codex token data</strong>
              <span>Scanning local JSONL history and preparing summaries.</span>
            </div>
          </section>
        ) : !hasDashboardData ? (
          <section className="empty-state">
            <Database size={20} aria-hidden="true" />
            <div>
              <strong>No dashboard data available</strong>
              <span>
                {error
                  ? 'Refresh failed before local token summaries could be built.'
                  : 'No token calls match the current filter.'}
              </span>
            </div>
          </section>
        ) : (
          <>
            <KpiStrip kpis={dashboard.kpis} />
            <UsageCharts trend={dashboard.trend} />
            <section className="lower-grid">
              <SessionRanking
                sessions={sortedSessions}
                selectedSessionId={selectedSessionId}
                sort={sessionSort}
                onSessionSelect={selectSession}
                onSortChange={setSessionSort}
              />
              <PromptTable
                prompts={sortedPrompts}
                selectedPromptId={selectedPrompt?.promptId ?? ''}
                sort={promptSort}
                onPromptSelect={selectPrompt}
                onSortChange={changePromptSort}
              />
              <PromptComposition context={compositionContext} />
            </section>
          </>
        )}
      </main>
    </div>
  );
};
