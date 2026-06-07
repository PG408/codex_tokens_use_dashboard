import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { InputSourceEstimate, TokenUsage } from '../../shared/types.js';
import { formatNumber, formatPercent } from '../formatters.js';

type PromptCompositionProps = {
  context: TokenCompositionContext | null;
};

export type TokenCompositionContext = {
  kind: 'summary' | 'session' | 'prompt';
  titleLabel: string;
  title: string;
  details: Array<{ label: string; value: string }>;
  usage: TokenUsage;
  inputCacheHitRate: number | null;
  inputSources: InputSourceEstimate[];
};

const COLORS = {
  cached: '#08968f',
  nonCached: '#d7dddd',
  output: '#e23b45',
  reasoning: '#f5b82e'
};

export const PromptComposition = ({ context }: PromptCompositionProps) => {
  if (context === null) {
    return (
      <aside className="panel composition-panel">
        <div className="rail-heading">
          <h2>Token composition</h2>
        </div>
        <div className="compact-empty">No token composition is available.</div>
      </aside>
    );
  }

  const nonCachedInput = Math.max(
    context.usage.inputTokens - context.usage.cachedInputTokens,
    0
  );
  const donutData = [
    {
      name: 'Cached input tokens',
      value: context.usage.cachedInputTokens,
      color: COLORS.cached
    },
    { name: 'Non-cached input tokens', value: nonCachedInput, color: COLORS.nonCached },
    { name: 'Output tokens', value: context.usage.outputTokens, color: COLORS.output },
    {
      name: 'Reasoning output tokens',
      value: context.usage.reasoningOutputTokens,
      color: COLORS.reasoning
    }
  ].filter((item) => item.value > 0);
  const inputSources = context.inputSources.slice(0, 8);

  return (
    <aside className="panel composition-panel">
      <div className="rail-heading">
        <h2>Token composition</h2>
      </div>

      <dl className="prompt-meta">
        <div>
          <dt>{context.titleLabel}</dt>
          <dd>{context.title}</dd>
        </div>
        {context.details.map((detail) => (
          <div key={detail.label}>
            <dt>{detail.label}</dt>
            <dd>{detail.value}</dd>
          </div>
        ))}
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
          <strong>{formatNumber(context.usage.inputTokens)}</strong>
          <span>Total input tokens</span>
        </div>
      </div>

      <ul className="composition-list">
        <li>
          <span className="swatch cached" />
          <span>Cached input tokens</span>
          <strong>
            {formatNumber(context.usage.cachedInputTokens)} (
            {formatPercent(context.inputCacheHitRate)})
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
          <strong>{formatNumber(context.usage.outputTokens)}</strong>
        </li>
        <li>
          <span className="swatch reasoning" />
          <span>Reasoning output tokens</span>
          <strong>{formatNumber(context.usage.reasoningOutputTokens)}</strong>
        </li>
      </ul>

      <section className="input-source-section">
        <div className="section-subheading">
          <h3>Input source attribution</h3>
          <span>Estimated</span>
        </div>
        {inputSources.length > 0 ? (
          <ul className="input-source-list">
            {inputSources.map((source) => (
              <li key={source.sourceId}>
                <div className="input-source-row">
                  <span>{source.label}</span>
                  <strong>{formatNumber(source.estimatedTokens)}</strong>
                </div>
                <div className="input-source-track" aria-hidden="true">
                  <span style={{ width: `${Math.max(source.share * 100, 2)}%` }} />
                </div>
                <div className="input-source-meta">
                  <span>{formatPercent(source.share)}</span>
                  <span>{formatNumber(source.chars)} chars</span>
                  <span>{source.confidence}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="input-source-empty">
            No visible context sources were captured for this prompt.
          </div>
        )}
        <p className="input-source-note">
          Estimated from visible JSONL context and normalized to real input tokens.
        </p>
      </section>

      <div className="cache-rate-summary">
        <span>Cache hit rate</span>
        <strong>{formatPercent(context.inputCacheHitRate)}</strong>
      </div>
    </aside>
  );
};
