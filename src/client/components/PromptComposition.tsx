import { X } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DashboardPrompt } from '../App.js';
import { formatDateTime, formatNumber, formatPercent } from '../App.js';

type PromptCompositionProps = {
  prompt: DashboardPrompt | null;
};

const COLORS = {
  cached: '#08968f',
  nonCached: '#d7dddd',
  output: '#e23b45',
  reasoning: '#f5b82e'
};

export const PromptComposition = ({ prompt }: PromptCompositionProps) => {
  if (prompt === null) {
    return (
      <aside className="panel composition-panel">
        <div className="rail-heading">
          <h2>Prompt token composition</h2>
          <X size={16} aria-hidden="true" />
        </div>
        <div className="compact-empty">Select a prompt to inspect composition.</div>
      </aside>
    );
  }

  const nonCachedInput = Math.max(
    prompt.inputTokens - prompt.cachedInputTokens,
    0
  );
  const donutData = [
    { name: 'Cached input tokens', value: prompt.cachedInputTokens, color: COLORS.cached },
    { name: 'Non-cached input tokens', value: nonCachedInput, color: COLORS.nonCached },
    { name: 'Output tokens', value: prompt.outputTokens, color: COLORS.output },
    {
      name: 'Reasoning output tokens',
      value: prompt.reasoningOutputTokens,
      color: COLORS.reasoning
    }
  ].filter((item) => item.value > 0);

  return (
    <aside className="panel composition-panel">
      <div className="rail-heading">
        <h2>Prompt token composition</h2>
        <X size={16} aria-hidden="true" />
      </div>

      <dl className="prompt-meta">
        <div>
          <dt>Selected prompt</dt>
          <dd>{formatDateTime(prompt.startedAt)}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{prompt.sessionId}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{prompt.model || 'unknown'}</dd>
        </div>
      </dl>

      <div className="donut-wrap">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Pie
              data={donutData}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={76}
              paddingAngle={2}
            >
              {donutData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [formatNumber(value), name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{formatNumber(prompt.inputTokens)}</strong>
          <span>Total input tokens</span>
        </div>
      </div>

      <ul className="composition-list">
        <li>
          <span className="swatch cached" />
          <span>Cached input tokens</span>
          <strong>
            {formatNumber(prompt.cachedInputTokens)} (
            {formatPercent(prompt.inputCacheHitRate)})
          </strong>
        </li>
        <li>
          <span className="swatch non-cached" />
          <span>Non-cached input tokens</span>
          <strong>{formatNumber(nonCachedInput)}</strong>
        </li>
        <li>
          <span className="swatch output" />
          <span>Output tokens</span>
          <strong>{formatNumber(prompt.outputTokens)}</strong>
        </li>
        <li>
          <span className="swatch reasoning" />
          <span>Reasoning output tokens</span>
          <strong>{formatNumber(prompt.reasoningOutputTokens)}</strong>
        </li>
      </ul>

      <div className="cache-rate-summary">
        <span>Cache hit rate</span>
        <strong>{formatPercent(prompt.inputCacheHitRate)}</strong>
      </div>
    </aside>
  );
};
