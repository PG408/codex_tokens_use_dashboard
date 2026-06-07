import {
  AlertCircle,
  Bell,
  Braces,
  CheckCircle2,
  ClipboardList,
  Code2,
  Database,
  FileText,
  Folder,
  Home,
  Moon,
  Settings,
  Users
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardData } from '../shared/types.js';
import { KpiStrip } from './components/KpiStrip.js';
import { PromptComposition } from './components/PromptComposition.js';
import { PromptTable } from './components/PromptTable.js';
import { SessionRanking } from './components/SessionRanking.js';
import { Toolbar } from './components/Toolbar.js';
import { UsageCharts } from './components/UsageCharts.js';

export type DashboardPrompt = DashboardData['prompts'][number];
export type DashboardSession = DashboardData['sessions'][number];
export type PromptSortKey =
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'inputCacheHitRate';
export type SessionSortKey =
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'inputCacheHitRate';
type SortDirection = 'asc' | 'desc';
type TimeRange = 'all' | '7d' | '30d';

type SortState<T extends string> = {
  key: T;
  direction: SortDirection;
};

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

let didBootstrapRefresh = false;

const navItems = [
  { label: 'Overview', icon: Home, active: true },
  { label: 'Sessions', icon: ClipboardList },
  { label: 'Prompts', icon: FileText },
  { label: 'Models', icon: Braces },
  { label: 'Users', icon: Users },
  { label: 'Projects', icon: Folder },
  { label: 'Files', icon: Database },
  { label: 'Alerts', icon: Bell },
  { label: 'Exports', icon: AlertCircle },
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

export const formatNumber = (value: number): string => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  }
  return new Intl.NumberFormat().format(value);
};

export const formatPercent = (value: number | null): string =>
  value === null ? '-' : `${(value * 100).toFixed(1)}%`;

export const formatDateTime = (value: string): string => {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
};

export const formatCompactDate = (value: string): string => {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
};

export const App = () => {
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
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

  const query = useMemo(
    () => dashboardQuery(timeRange, sessionId, searchTerm),
    [timeRange, sessionId, searchTerm]
  );

  const loadDashboard = useCallback(
    async (mode: 'get' | 'refresh') => {
      const isRefresh = mode === 'refresh';
      setError(null);
      setIsLoading((current) => current || !dashboard.refreshedAt);
      setIsRefreshing(isRefresh);

      try {
        const endpoint = isRefresh ? `/api/refresh${query}` : `/api/dashboard${query}`;
        const response = await fetch(endpoint, {
          method: isRefresh ? 'POST' : 'GET'
        });
        if (!response.ok) {
          throw new Error(`API request failed with ${response.status}`);
        }
        const nextDashboard = (await response.json()) as DashboardData;
        setDashboard(nextDashboard);
        setSelectedPromptId((current) => {
          if (nextDashboard.prompts.some((prompt) => prompt.promptId === current)) {
            return current;
          }
          return nextDashboard.prompts[0]?.promptId ?? '';
        });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load dashboard data'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [dashboard.refreshedAt, query]
  );

  useEffect(() => {
    if (!didBootstrapRefresh) {
      didBootstrapRefresh = true;
      void loadDashboard('refresh');
      return;
    }
    void loadDashboard('get');
  }, [loadDashboard]);

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

  const sessionOptions = useMemo(
    () =>
      dashboard.sessions.map((session) => ({
        value: session.sessionId,
        label: session.sessionId
      })),
    [dashboard.sessions]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Code2 size={24} aria-hidden="true" />
          <span>Codex Token Monitor</span>
        </div>
        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <button
              className={`nav-item${item.active ? ' nav-item-active' : ''}`}
              key={item.label}
              type="button"
            >
              <item.icon size={17} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
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
          <button className="theme-toggle" type="button">
            <Moon size={16} aria-hidden="true" />
            <span>Light mode</span>
          </button>
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
