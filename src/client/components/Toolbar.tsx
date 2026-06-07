import { CalendarDays, RefreshCw, Search } from 'lucide-react';
import type { DateRange, TimeRange } from '../clientTypes.js';
import { formatDateTime } from '../formatters.js';

type SessionOption = {
  value: string;
  label: string;
};

const quickRanges: Array<{ value: TimeRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'All' }
];

type ToolbarProps = {
  dateRange: DateRange;
  isRefreshing: boolean;
  lastRefreshed: string;
  searchTerm: string;
  selectedSessionId: string;
  sessionOptions: SessionOption[];
  timeRange: TimeRange;
  onDateRangeChange: (value: DateRange) => void;
  onRefresh: () => void;
  onSearchTermChange: (value: string) => void;
  onSessionChange: (value: string) => void;
  onTimeRangeChange: (value: TimeRange) => void;
};

export const Toolbar = ({
  dateRange,
  isRefreshing,
  lastRefreshed,
  searchTerm,
  selectedSessionId,
  sessionOptions,
  timeRange,
  onDateRangeChange,
  onRefresh,
  onSearchTermChange,
  onSessionChange,
  onTimeRangeChange
}: ToolbarProps) => {
  const updateDateRange = (value: DateRange) => {
    onDateRangeChange(value);
    onTimeRangeChange('custom');
  };

  return (
    <section className="toolbar" aria-label="Dashboard filters">
      <div className="field-control time-field">
        <span>Time range</span>
        <div className="quick-range-row" aria-label="Quick time ranges">
          {quickRanges.map((range) => (
            <button
              className={`quick-range-button${
                timeRange === range.value ? ' active' : ''
              }`}
              key={range.value}
              type="button"
              onClick={() => onTimeRangeChange(range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>
        <div className="date-range-row" aria-label="Custom date range">
          <label className="date-input-wrap">
            <CalendarDays size={14} aria-hidden="true" />
            <span>From</span>
            <input
              type="date"
              value={dateRange.from}
              max={dateRange.to || undefined}
              onFocus={() => onTimeRangeChange('custom')}
              onMouseDown={() => onTimeRangeChange('custom')}
              onInput={(event) =>
                updateDateRange({
                  ...dateRange,
                  from: event.currentTarget.value
                })
              }
              onChange={(event) =>
                updateDateRange({
                  ...dateRange,
                  from: event.target.value
                })
              }
            />
          </label>
          <label className="date-input-wrap">
            <span>To</span>
            <input
              type="date"
              value={dateRange.to}
              min={dateRange.from || undefined}
              onFocus={() => onTimeRangeChange('custom')}
              onMouseDown={() => onTimeRangeChange('custom')}
              onInput={(event) =>
                updateDateRange({
                  ...dateRange,
                  to: event.currentTarget.value
                })
              }
              onChange={(event) =>
                updateDateRange({
                  ...dateRange,
                  to: event.target.value
                })
              }
            />
          </label>
        </div>
      </div>

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
};
