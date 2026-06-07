import {
  Activity,
  CircleDot,
  Gauge,
  Hash,
  Inbox,
  Layers3,
  MessageSquareText,
  Radio
} from 'lucide-react';
import type { DashboardData } from '../../shared/types.js';
import { formatNumber, formatPercent } from '../App.js';

type KpiStripProps = {
  kpis: DashboardData['kpis'];
};

const kpiItems = (kpis: DashboardData['kpis']) => [
  {
    label: 'Total tokens',
    value: formatNumber(kpis.totalTokens),
    note: 'Current filter',
    icon: Hash
  },
  {
    label: 'Input tokens',
    value: formatNumber(kpis.inputTokens),
    note: 'Prompt and context input',
    icon: Inbox
  },
  {
    label: 'Cached input tokens',
    value: formatNumber(kpis.cachedInputTokens),
    note: 'Input served from cache',
    icon: Layers3
  },
  {
    label: 'Output tokens',
    value: formatNumber(kpis.outputTokens),
    note: 'Assistant responses',
    icon: Radio,
    tone: 'red'
  },
  {
    label: 'Reasoning output tokens',
    value: formatNumber(kpis.reasoningOutputTokens),
    note: 'Reasoning token usage',
    icon: Activity,
    tone: 'yellow'
  },
  {
    label: 'Input cache hit rate',
    value: formatPercent(kpis.inputCacheHitRate),
    note: 'Cached input / input',
    icon: Gauge
  },
  {
    label: 'Session count',
    value: formatNumber(kpis.sessionCount),
    note: 'Sessions with token calls',
    icon: CircleDot
  },
  {
    label: 'Prompt count',
    value: formatNumber(kpis.promptCount),
    note: 'Attributed user prompts',
    icon: MessageSquareText
  }
];

export const KpiStrip = ({ kpis }: KpiStripProps) => (
  <section className="kpi-strip" aria-label="Token summary">
    {kpiItems(kpis).map((item) => (
      <article className="kpi-item" key={item.label}>
        <div className={`kpi-icon ${item.tone ?? 'teal'}`}>
          <item.icon size={15} aria-hidden="true" />
        </div>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.note}</small>
      </article>
    ))}
  </section>
);
