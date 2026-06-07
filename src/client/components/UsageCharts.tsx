import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { DashboardData } from '../../shared/types.js';
import { formatCompactDate, formatNumber, formatPercent } from '../formatters.js';

type UsageChartsProps = {
  trend: DashboardData['trend'];
};

const tokenTooltipFormatter = (value: number, name: string) => [
  formatNumber(value),
  name
];

const percentTooltipFormatter = (value: number) => [
  formatPercent(value),
  'Input cache hit rate'
];

const rateValues = (trend: DashboardData['trend']) =>
  trend.filter((bucket) => bucket.inputCacheHitRate !== null);

const averageRate = (trend: DashboardData['trend']): number | null => {
  const values = rateValues(trend);
  if (values.length === 0) {
    return null;
  }
  return (
    values.reduce((total, bucket) => total + (bucket.inputCacheHitRate ?? 0), 0) /
    values.length
  );
};

export const UsageCharts = ({ trend }: UsageChartsProps) => {
  const avgRate = averageRate(trend);
  const peaks = rateValues(trend);
  const peak = peaks.reduce<(typeof peaks)[number] | null>(
    (current, bucket) =>
      current === null ||
      (bucket.inputCacheHitRate ?? 0) > (current.inputCacheHitRate ?? 0)
        ? bucket
        : current,
    null
  );
  const low = peaks.reduce<(typeof peaks)[number] | null>(
    (current, bucket) =>
      current === null ||
      (bucket.inputCacheHitRate ?? 0) < (current.inputCacheHitRate ?? 0)
        ? bucket
        : current,
    null
  );

  return (
    <section className="chart-grid" aria-label="Token trends">
      <article className="chart-panel">
        <div className="panel-heading">
          <h2>Token usage over time</h2>
          <div className="legend-row" aria-label="Chart legend">
            <span className="legend-item teal">Input tokens</span>
            <span className="legend-item teal dashed">Cached input tokens</span>
            <span className="legend-item red">Output tokens</span>
            <span className="legend-item yellow">Reasoning output tokens</span>
          </div>
        </div>
        {trend.length === 0 ? (
          <div className="compact-empty">No token usage for this filter.</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend} margin={{ top: 16, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e5e7e7" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={formatCompactDate}
                tickLine={false}
                axisLine={false}
                minTickGap={18}
              />
              <YAxis
                tickFormatter={formatNumber}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip formatter={tokenTooltipFormatter} labelFormatter={formatCompactDate} />
              <Line
                dataKey="inputTokens"
                name="Input tokens"
                type="monotone"
                stroke="#08968f"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="cachedInputTokens"
                name="Cached input tokens"
                type="monotone"
                stroke="#08968f"
                strokeDasharray="6 5"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="outputTokens"
                name="Output tokens"
                type="monotone"
                stroke="#e23b45"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="reasoningOutputTokens"
                name="Reasoning output tokens"
                type="monotone"
                stroke="#f5b82e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </article>

      <article className="chart-panel rate-panel">
        <div className="panel-heading">
          <h2>Input cache hit rate over time</h2>
        </div>
        <div className="rate-chart-layout">
          <div className="rate-chart">
            {trend.length === 0 ? (
              <div className="compact-empty">No cache-rate data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart
                  data={trend}
                  margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e5e7e7" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={formatCompactDate}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis
                    domain={[0, 1]}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                    tickFormatter={formatPercent}
                    tickLine={false}
                    axisLine={false}
                    width={54}
                  />
                  <Tooltip
                    formatter={percentTooltipFormatter}
                    labelFormatter={formatCompactDate}
                  />
                  <Line
                    dataKey="inputCacheHitRate"
                    name="Input cache hit rate"
                    type="monotone"
                    stroke="#08968f"
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 0, fill: '#08968f' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <dl className="rate-stats">
            <div>
              <dt>Avg hit rate</dt>
              <dd>{formatPercent(avgRate)}</dd>
            </div>
            <div>
              <dt>Peak</dt>
              <dd>{formatPercent(peak?.inputCacheHitRate ?? null)}</dd>
              <span>{peak ? formatCompactDate(peak.bucket) : '-'}</span>
            </div>
            <div>
              <dt>Low</dt>
              <dd>{formatPercent(low?.inputCacheHitRate ?? null)}</dd>
              <span>{low ? formatCompactDate(low.bucket) : '-'}</span>
            </div>
          </dl>
        </div>
      </article>
    </section>
  );
};
