import { Info } from 'lucide-react';
import type { DashboardSession, SessionSortKey } from '../clientTypes.js';
import { formatNumber, formatPercent } from '../formatters.js';
import {
  projectNameFromCwd,
  sessionHoverTitle,
  sessionName
} from '../sessionDisplay.js';

type SortState = {
  key: SessionSortKey;
  direction: 'asc' | 'desc';
};

type SessionRankingProps = {
  sessions: DashboardSession[];
  sort: SortState;
  onSortChange: (sort: SortState) => void;
};

const sortOptions: Array<{ label: string; value: SessionSortKey }> = [
  { label: 'Total tokens', value: 'totalTokens' },
  { label: 'Input tokens', value: 'inputTokens' },
  { label: 'Output tokens', value: 'outputTokens' },
  { label: 'Cache hit rate', value: 'inputCacheHitRate' }
];

const sessionFooterRange = (sessionCount: number): string => {
  if (sessionCount === 0) {
    return '0 of 0';
  }
  return `1-${Math.min(sessionCount, 10)} of ${formatNumber(sessionCount)}`;
};

export const SessionRanking = ({
  sessions,
  sort,
  onSortChange
}: SessionRankingProps) => (
  <article className="panel session-panel">
    <div className="table-heading">
      <div className="panel-title">
        <h2>Session ranking</h2>
        <Info size={14} aria-hidden="true" />
      </div>
      <label className="sort-control">
        <span>Sort by</span>
        <select
          value={sort.key}
          onChange={(event) =>
            onSortChange({
              key: event.target.value as SessionSortKey,
              direction: 'desc'
            })
          }
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>

    {sessions.length === 0 ? (
      <div className="compact-empty">No sessions match this filter.</div>
    ) : (
      <div className="table-scroll">
        <table className="data-table compact-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Session</th>
              <th>Total tokens</th>
              <th>Input tokens</th>
              <th>Output tokens</th>
              <th>Cache hit rate</th>
            </tr>
          </thead>
          <tbody>
            {sessions.slice(0, 10).map((session, index) => (
              <tr key={session.sessionId}>
                <td>{index + 1}</td>
                <td className="session-display-cell" title={sessionHoverTitle(session)}>
                  <strong>{projectNameFromCwd(session.cwd)}</strong>
                  <span>{sessionName(session)}</span>
                </td>
                <td>{formatNumber(session.totalTokens)}</td>
                <td>{formatNumber(session.inputTokens)}</td>
                <td>{formatNumber(session.outputTokens)}</td>
                <td>{formatPercent(session.inputCacheHitRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <div className="table-foot">{sessionFooterRange(sessions.length)} sessions</div>
  </article>
);
