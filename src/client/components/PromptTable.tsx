import { ArrowDown, ArrowUp } from 'lucide-react';
import type { DashboardPrompt, PromptSortKey } from '../clientTypes.js';
import { formatDateTime, formatNumber, formatPercent } from '../formatters.js';
import { projectNameFromCwd, sessionLabel } from '../sessionDisplay.js';

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

const promptFooterRange = (promptCount: number): string => {
  if (promptCount === 0) {
    return '0 of 0';
  }
  return `1-${Math.min(promptCount, 20)} of ${formatNumber(promptCount)}`;
};

const modelLabel = (prompt: DashboardPrompt): string => {
  const model = prompt.model || 'unknown';

  return prompt.modelEffort ? `${model} / ${prompt.modelEffort}` : model;
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
              <th>Project</th>
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
                <td className="project-name-cell">{projectNameFromCwd(prompt.cwd)}</td>
                <td className="session-id-cell">
                  <span className="session-id-copy">
                    <span className="session-id-short">
                      {sessionLabel(prompt.sessionId)}
                    </span>
                    <span className="session-id-tooltip" role="tooltip">
                      {prompt.sessionId}
                    </span>
                  </span>
                </td>
                <td className="model-cell" title={modelLabel(prompt)}>
                  {modelLabel(prompt)}
                </td>
                <td className="prompt-preview">
                  <span className="prompt-preview-copy">
                    <span className="prompt-preview-text">
                      {prompt.promptPreview}
                    </span>
                    <span className="prompt-preview-tooltip" role="tooltip">
                      {prompt.promptPreview}
                    </span>
                  </span>
                </td>
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
    <div className="table-foot">{promptFooterRange(prompts.length)} prompts</div>
  </article>
);
