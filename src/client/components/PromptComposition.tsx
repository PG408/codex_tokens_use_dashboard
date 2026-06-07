import { useEffect, useMemo, useState } from 'react';
import type {
  InputSourceCategory,
  InputSourceEstimate,
  TokenUsage
} from '../../shared/types.js';
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

type TokenCompositionRow = {
  id: string;
  label: string;
  value: number;
  color: string;
};

type SourceHierarchyLeaf = {
  source: InputSourceEstimate;
  topId: string;
  topLabel: string;
  secondId: string;
  secondLabel: string;
  thirdId: string;
  thirdLabel: string;
};

type SourceContributionRow = {
  id: string;
  label: string;
  estimatedTokens: number;
  share: number;
  chars: number;
  events: number;
  confidence: InputSourceEstimate['confidence'];
  canDrill: boolean;
};

type SourceDrillPath = {
  topId?: string;
  secondId?: string;
};

const sourceTopGroup = (
  category: InputSourceCategory
): { id: string; label: string } => {
  if (category === 'tool_calls' || category === 'tool_outputs') {
    return { id: 'tools', label: 'Tool context' };
  }

  if (category === 'conversation_history' || category === 'compacted_history') {
    return { id: 'conversation', label: 'Conversation context' };
  }

  if (category === 'user_prompt') {
    return { id: 'user', label: 'User input' };
  }

  return { id: 'system', label: 'System context' };
};

const defaultSourceSecondLabels: Record<InputSourceCategory, string> = {
  user_prompt: 'Direct user prompt',
  system_developer: 'System and developer',
  instructions_skills: 'Instructions',
  conversation_history: 'Conversation history',
  tool_calls: 'Tool calls',
  tool_outputs: 'Tool outputs',
  compacted_history: 'Compacted history',
  runtime_metadata: 'Runtime metadata'
};

const sourceSecondLabel = (source: InputSourceEstimate): string => {
  if (source.category !== 'instructions_skills') {
    return defaultSourceSecondLabels[source.category];
  }

  if (source.label.startsWith('Skill: ')) {
    return 'Skills';
  }

  if (source.label === 'Dynamic tools') {
    return 'Dynamic tools';
  }

  return 'Instructions';
};

const sourceThirdLabel = (source: InputSourceEstimate): string =>
  source.label
    .replace(/^Tool (call|output):\s*/, '')
    .replace(/^Skill:\s*/, '');

const hierarchyLeavesFrom = (
  inputSources: InputSourceEstimate[]
): SourceHierarchyLeaf[] =>
  inputSources.map((source) => {
    const top = sourceTopGroup(source.category);
    const secondLabel = sourceSecondLabel(source);
    const thirdLabel = sourceThirdLabel(source);

    return {
      source,
      topId: top.id,
      topLabel: top.label,
      secondId: `${top.id}:${source.category}:${secondLabel}`,
      secondLabel,
      thirdId: source.sourceId,
      thirdLabel
    };
  });

const aggregateContributionRows = (
  leaves: SourceHierarchyLeaf[],
  level: 'top' | 'second' | 'third',
  denominator: number
): SourceContributionRow[] => {
  const rows = new Map<string, SourceContributionRow>();

  leaves.forEach((leaf) => {
    const id =
      level === 'top'
        ? leaf.topId
        : level === 'second'
          ? leaf.secondId
          : leaf.thirdId;
    const label =
      level === 'top'
        ? leaf.topLabel
        : level === 'second'
          ? leaf.secondLabel
          : leaf.thirdLabel;
    const existing = rows.get(id);
    rows.set(id, {
      id,
      label,
      estimatedTokens:
        (existing?.estimatedTokens ?? 0) + leaf.source.estimatedTokens,
      share: 0,
      chars: (existing?.chars ?? 0) + leaf.source.chars,
      events: (existing?.events ?? 0) + leaf.source.events,
      confidence: existing?.confidence ?? leaf.source.confidence,
      canDrill: level !== 'third'
    });
  });

  const shareDenominator =
    denominator > 0
      ? denominator
      : [...rows.values()].reduce((sum, row) => sum + row.estimatedTokens, 0);

  return [...rows.values()]
    .map((row) => ({
      ...row,
      share:
        shareDenominator > 0 ? row.estimatedTokens / shareDenominator : 0
    }))
    .sort((left, right) => right.estimatedTokens - left.estimatedTokens);
};

const rowTrackWidth = (share: number): string => `${Math.max(share * 100, 2)}%`;

export const PromptComposition = ({ context }: PromptCompositionProps) => {
  const [sourceDrillPath, setSourceDrillPath] = useState<SourceDrillPath>({});
  const hierarchyLeaves = useMemo(
    () => (context ? hierarchyLeavesFrom(context.inputSources) : []),
    [context]
  );

  useEffect(() => {
    setSourceDrillPath({});
  }, [context?.kind, context?.title]);

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
  const tokenCompositionRows: TokenCompositionRow[] = [
    {
      id: 'cached',
      label: 'Cached input tokens',
      value: context.usage.cachedInputTokens,
      color: COLORS.cached
    },
    {
      id: 'non-cached',
      label: 'Non-cached input tokens',
      value: nonCachedInput,
      color: COLORS.nonCached
    },
    {
      id: 'output',
      label: 'Output tokens',
      value: context.usage.outputTokens,
      color: COLORS.output
    },
    {
      id: 'reasoning',
      label: 'Reasoning output tokens',
      value: context.usage.reasoningOutputTokens,
      color: COLORS.reasoning
    }
  ].filter((item) => item.value > 0);
  const tokenCompositionTotal = tokenCompositionRows.reduce(
    (sum, row) => sum + row.value,
    0
  );
  const selectedTop = sourceDrillPath.topId
    ? hierarchyLeaves.find((leaf) => leaf.topId === sourceDrillPath.topId)
    : undefined;
  const selectedSecond = sourceDrillPath.secondId
    ? hierarchyLeaves.find((leaf) => leaf.secondId === sourceDrillPath.secondId)
    : undefined;
  const contributionLeaves = hierarchyLeaves.filter((leaf) => {
    if (sourceDrillPath.secondId) {
      return leaf.secondId === sourceDrillPath.secondId;
    }
    if (sourceDrillPath.topId) {
      return leaf.topId === sourceDrillPath.topId;
    }
    return true;
  });
  const contributionRows = aggregateContributionRows(
    contributionLeaves,
    sourceDrillPath.secondId
      ? 'third'
      : sourceDrillPath.topId
        ? 'second'
        : 'top',
    contributionLeaves.reduce(
      (sum, leaf) => sum + leaf.source.estimatedTokens,
      0
    )
  );

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

      <section className="token-breakdown-section">
        <div className="section-subheading">
          <h3>Token type contribution</h3>
          <span>{formatNumber(context.usage.totalTokens)} total</span>
        </div>
        <ul className="bar-list token-bar-list">
          {tokenCompositionRows.map((row) => {
            const share =
              tokenCompositionTotal > 0 ? row.value / tokenCompositionTotal : 0;
            return (
              <li key={row.id}>
                <div className="bar-row">
                  <span>{row.label}</span>
                  <strong>
                    {formatNumber(row.value)} ({formatPercent(share)})
                  </strong>
                </div>
                <div className="bar-track" aria-hidden="true">
                  <span
                    style={{
                      background: row.color,
                      width: rowTrackWidth(share)
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="input-source-section">
        <div className="section-subheading">
          <h3>Input source contribution</h3>
          <span>Estimated</span>
        </div>
        <div className="source-breadcrumb" aria-label="Input source level">
          <button
            className={!sourceDrillPath.topId ? 'active' : undefined}
            type="button"
            onClick={() => setSourceDrillPath({})}
          >
            Level 1
          </button>
          {selectedTop ? (
            <button
              className={!sourceDrillPath.secondId ? 'active' : undefined}
              type="button"
              onClick={() => setSourceDrillPath({ topId: selectedTop.topId })}
            >
              {selectedTop.topLabel}
            </button>
          ) : null}
          {selectedSecond ? (
            <button className="active" type="button">
              {selectedSecond.secondLabel}
            </button>
          ) : null}
        </div>
        {contributionRows.length > 0 ? (
          <ul className="bar-list input-source-list">
            {contributionRows.map((row) => (
              <li key={row.id}>
                <button
                  className="source-drill-button"
                  disabled={!row.canDrill}
                  type="button"
                  onClick={() => {
                    if (!sourceDrillPath.topId) {
                      setSourceDrillPath({ topId: row.id });
                      return;
                    }
                    setSourceDrillPath({
                      topId: sourceDrillPath.topId,
                      secondId: row.id
                    });
                  }}
                >
                  <div className="bar-row">
                    <span>{row.label}</span>
                    <strong>{formatNumber(row.estimatedTokens)}</strong>
                  </div>
                </button>
                <div className="bar-track" aria-hidden="true">
                  <span style={{ width: rowTrackWidth(row.share) }} />
                </div>
                <div className="bar-meta">
                  <span>{formatPercent(row.share)}</span>
                  <span>{formatNumber(row.chars)} chars</span>
                  <span>{row.confidence}</span>
                  {row.canDrill ? <span>Drill down</span> : null}
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
