import {
  AlertCircle,
  Braces,
  CheckCircle2,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Folder,
  Home,
  Moon,
  Settings
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardData } from '../shared/types.js';
import type {
  DashboardSession,
  PromptSortKey,
  SessionSortKey,
  SortDirection,
  SortState,
  TimeRange
} from './clientTypes.js';
import { KpiStrip } from './components/KpiStrip.js';
import { PromptComposition } from './components/PromptComposition.js';
import { PromptTable } from './components/PromptTable.js';
import { SessionRanking } from './components/SessionRanking.js';
import { Toolbar } from './components/Toolbar.js';
import { UsageCharts } from './components/UsageCharts.js';

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
  { label: 'Overview', icon: Home },
  { label: 'Sessions', icon: ClipboardList },
  { label: 'Prompts', icon: FileText },
  { label: 'Models', icon: Braces },
  { label: 'Projects', icon: Folder },
  { label: 'Files', icon: Database },
  { label: 'Settings', icon: Settings }
];

const timeRangeToQuery = (timeRange: TimeRange): URLSearchParams => {
  const params = new URLSearchParams();
  if (timeRange === 'all') {
    return params;
  }

  const days = timeRange === '7d' ? 7 : 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (days - 1));
  params.set('from', from.toISOString().slice(0, 10));
  params.set('to', to.toISOString().slice(0, 10));
  return params;
};

const dashboardQuery = (
  timeRange: TimeRange,
  sessionId: string,
  searchTerm: string
): string => {
  const params = timeRangeToQuery(timeRange);
  if (sessionId) {
    params.set('sessionId', sessionId);
  }
  if (searchTerm.trim()) {
    params.set('q', searchTerm.trim());
  }
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

const sessionOptionsFromDashboard = (
  sessions: DashboardSession[]
): Array<{ value: string; label: string }> =>
  sessions.map((session) => ({
    value: session.sessionId,
    label: session.sessionId
  }));

export const App = () => {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [sessionOptions, setSessionOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [sessionId, setSessionId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState('');
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
    () => dashboardQuery(timeRange, sessionId, searchTerm),
    [timeRange, sessionId, searchTerm]
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
        if (requestQuery === '') {
          setSessionOptions(sessionOptionsFromDashboard(nextDashboard.sessions));
        }
        setSelectedPromptId((current) => {
          if (nextDashboard.prompts.some((prompt) => prompt.promptId === current)) {
            return current;
          }
          return nextDashboard.prompts[0]?.promptId ?? '';
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

  const sortedPrompts = useMemo(
    () => sortRows(dashboard.prompts, promptSort.key, promptSort.direction),
    [dashboard.prompts, promptSort]
  );

  const sortedSessions = useMemo(
    () => sortRows(dashboard.sessions, sessionSort.key, sessionSort.direction),
    [dashboard.sessions, sessionSort]
  );

  const selectedPrompt =
    sortedPrompts.find((prompt) => prompt.promptId === selectedPromptId) ??
    sortedPrompts[0] ??
    null;
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Code2 size={24} aria-hidden="true" />
          <span>Codex Token Monitor</span>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <a className="nav-item nav-item-active" href="#overview" aria-current="page">
            <Home size={17} aria-hidden="true" />
            <span>Overview</span>
          </a>
          {navItems.slice(1).map((item) => (
            <div className="nav-label" key={item.label}>
              <item.icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </div>
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
        <header className="page-header">
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
          lastRefreshed={dashboard.refreshedAt}
          searchTerm={searchTerm}
          selectedSessionId={sessionId}
          sessionOptions={sessionOptions}
          timeRange={timeRange}
          onRefresh={() => void loadDashboard('refresh')}
          onSearchTermChange={setSearchTerm}
          onSessionChange={setSessionId}
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
                sort={sessionSort}
                onSortChange={setSessionSort}
              />
              <PromptTable
                prompts={sortedPrompts}
                selectedPromptId={selectedPrompt?.promptId ?? ''}
                sort={promptSort}
                onPromptSelect={setSelectedPromptId}
                onSortChange={changePromptSort}
              />
              <PromptComposition prompt={selectedPrompt} />
            </section>
          </>
        )}
      </main>
    </div>
  );
};
