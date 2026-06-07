import { CalendarDays, RefreshCw, Search } from 'lucide-react';
import { formatDateTime } from '../formatters.js';

type TimeRange = 'all' | '7d' | '30d';

type SessionOption = {
  value: string;
  label: string;
};

type ToolbarProps = {
  isRefreshing: boolean;
  lastRefreshed: string;
  searchTerm: string;
  selectedSessionId: string;
  sessionOptions: SessionOption[];
  timeRange: TimeRange;
  onRefresh: () => void;
  onSearchTermChange: (value: string) => void;
  onSessionChange: (value: string) => void;
  onTimeRangeChange: (value: TimeRange) => void;
};

export const Toolbar = ({
  isRefreshing,
  lastRefreshed,
  searchTerm,
  selectedSessionId,
  sessionOptions,
  timeRange,
  onRefresh,
  onSearchTermChange,
  onSessionChange,
  onTimeRangeChange
}: ToolbarProps) => (
  <section className="toolbar" aria-label="Dashboard filters">
    <label className="field-control">
      <span>Time range</span>
      <div className="select-wrap">
        <CalendarDays size={15} aria-hidden="true" />
        <select
          value={timeRange}
          onChange={(event) => onTimeRangeChange(event.target.value as TimeRange)}
        >
          <option value="all">All available time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>
    </label>

    <label className="field-control">
      <span>Session filter</span>
      <select
        value={selectedSessionId}
        onChange={(event) => onSessionChange(event.target.value)}
      >
        <option value="">All sessions</option>
        {sessionOptions.map((session) => (
          <option key={session.value} value={session.value}>
            {session.label}
          </option>
        ))}
      </select>
    </label>

    <label className="field-control search-control">
      <span>Prompt summary search</span>
      <div className="search-wrap">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={searchTerm}
          placeholder="Search prompt summaries..."
          onChange={(event) => onSearchTermChange(event.target.value)}
        />
      </div>
    </label>

    <button
      className="refresh-button"
      type="button"
      disabled={isRefreshing}
      onClick={onRefresh}
    >
      <RefreshCw
        className={isRefreshing ? 'spin-icon' : undefined}
        size={16}
        aria-hidden="true"
      />
      <span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span>
    </button>

    <div className="last-refreshed">
      <span>Last refreshed</span>
      <strong>{formatDateTime(lastRefreshed)}</strong>
    </div>
  </section>
);
