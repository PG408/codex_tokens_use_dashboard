import { ArrowDown, ArrowUp } from 'lucide-react';
import type {
  DashboardPrompt,
  PromptSortKey
} from '../App.js';
import { formatDateTime, formatNumber, formatPercent } from '../App.js';

type SortState = {
  key: PromptSortKey;
  direction: 'asc' | 'desc';
};

type PromptTableProps = {
  prompts: DashboardPrompt[];
  selectedPromptId: string;
  sort: SortState;
  onPromptSelect: (promptId: string) => void;
  onSortChange: (key: PromptSortKey) => void;
};

const sortLabel: Record<PromptSortKey, string> = {
  totalTokens: 'Total',
  inputTokens: 'Input',
  outputTokens: 'Output',
  inputCacheHitRate: 'Cache'
};

const SortButton = ({
  keyName,
  sort,
  onSortChange
}: {
  keyName: PromptSortKey;
  sort: SortState;
  onSortChange: (key: PromptSortKey) => void;
}) => {
  const active = sort.key === keyName;
  const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      className={`sort-button${active ? ' active' : ''}`}
      type="button"
      onClick={() => onSortChange(keyName)}
    >
      <span>{sortLabel[keyName]}</span>
      {active ? <Icon size={12} aria-hidden="true" /> : null}
    </button>
  );
};

export const PromptTable = ({
  prompts,
  selectedPromptId,
  sort,
  onPromptSelect,
  onSortChange
}: PromptTableProps) => (
  <article className="panel prompt-panel">
    <div className="table-heading">
      <div className="panel-title">
        <h2>Prompt details</h2>
        <span>({formatNumber(prompts.length)} prompts)</span>
      </div>
      <div className="sort-buttons" aria-label="Prompt sorting">
        {(Object.keys(sortLabel) as PromptSortKey[]).map((keyName) => (
          <SortButton
            key={keyName}
            keyName={keyName}
            sort={sort}
            onSortChange={onSortChange}
          />
        ))}
      </div>
    </div>

    {prompts.length === 0 ? (
      <div className="compact-empty">No prompts match this filter.</div>
    ) : (
      <div className="table-scroll">
        <table className="data-table prompt-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Session</th>
              <th>Model</th>
              <th>Prompt summary</th>
              <th>Total tokens</th>
              <th>Input tokens</th>
              <th>Cached input</th>
              <th>Output tokens</th>
              <th>Reasoning</th>
              <th>Cache hit rate</th>
            </tr>
          </thead>
          <tbody>
            {prompts.slice(0, 20).map((prompt) => (
              <tr
                className={
                  prompt.promptId === selectedPromptId ? 'selected-row' : undefined
                }
                key={prompt.promptId}
                onClick={() => onPromptSelect(prompt.promptId)}
              >
                <td>{formatDateTime(prompt.startedAt)}</td>
                <td>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => onPromptSelect(prompt.promptId)}
                  >
                    {prompt.sessionId}
                  </button>
                </td>
                <td>{prompt.model || 'unknown'}</td>
                <td className="prompt-preview">{prompt.promptPreview}</td>
                <td>{formatNumber(prompt.totalTokens)}</td>
                <td>{formatNumber(prompt.inputTokens)}</td>
                <td>{formatNumber(prompt.cachedInputTokens)}</td>
                <td>{formatNumber(prompt.outputTokens)}</td>
                <td>{formatNumber(prompt.reasoningOutputTokens)}</td>
                <td className={prompt.inputCacheHitRate !== null ? 'rate-good' : undefined}>
                  {formatPercent(prompt.inputCacheHitRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <div className="table-foot">1-20 of {formatNumber(prompts.length)} prompts</div>
  </article>
);
