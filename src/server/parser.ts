import type {
  ParsedSession,
  PromptRecord,
  TokenUsage
} from '../shared/types.js';

type JsonObject = Record<string, unknown>;

const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0
});

const addUsage = (target: TokenUsage, delta: TokenUsage): void => {
  target.inputTokens += delta.inputTokens;
  target.cachedInputTokens += delta.cachedInputTokens;
  target.outputTokens += delta.outputTokens;
  target.reasoningOutputTokens += delta.reasoningOutputTokens;
  target.totalTokens += delta.totalTokens;
};

const toNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const usageFromSnakeCase = (value: unknown): TokenUsage | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const usage = value as JsonObject;
  return {
    inputTokens: toNumber(usage.input_tokens),
    cachedInputTokens: toNumber(usage.cached_input_tokens),
    outputTokens: toNumber(usage.output_tokens),
    reasoningOutputTokens: toNumber(usage.reasoning_output_tokens),
    totalTokens: toNumber(usage.total_tokens)
  };
};

const previewPrompt = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, 120);

const extractUserInputText = (payload: JsonObject): string | null => {
  if (
    payload.type !== 'message' ||
    payload.role !== 'user' ||
    !Array.isArray(payload.content)
  ) {
    return null;
  }

  const text = payload.content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const content = item as JsonObject;
      return content.type === 'input_text' && typeof content.text === 'string'
        ? content.text
        : '';
    })
    .filter((part) => part.length > 0)
    .join('\n');

  return text.length > 0 ? text : null;
};

export const parseSessionJsonl = (
  jsonl: string,
  sourceFile: string
): ParsedSession => {
  const prompts: PromptRecord[] = [];
  const tokenCalls: ParsedSession['tokenCalls'] = [];
  const session = {
    sessionId: sourceFile,
    sourceFile,
    startedAt: '',
    cwd: '',
    originator: '',
    modelProvider: '',
    cliVersion: '',
    lastSeenAt: ''
  };
  let currentPrompt: PromptRecord | null = null;
  let lastReportedTotalTokens = 0;

  jsonl.split(/\r?\n/).forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }

    const event = JSON.parse(line) as JsonObject;
    const timestamp = typeof event.timestamp === 'string' ? event.timestamp : '';
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as JsonObject)
        : {};

    if (timestamp) {
      session.lastSeenAt = timestamp;
    }

    if (event.type === 'session_meta') {
      session.sessionId =
        typeof payload.id === 'string' ? payload.id : session.sessionId;
      session.startedAt =
        typeof payload.timestamp === 'string' ? payload.timestamp : timestamp;
      session.cwd = typeof payload.cwd === 'string' ? payload.cwd : '';
      session.originator =
        typeof payload.originator === 'string' ? payload.originator : '';
      session.modelProvider =
        typeof payload.model_provider === 'string' ? payload.model_provider : '';
      session.cliVersion =
        typeof payload.cli_version === 'string' ? payload.cli_version : '';
      return;
    }

    if (event.type === 'response_item') {
      const userText = extractUserInputText(payload);

      if (userText) {
        currentPrompt = {
          promptId: `${session.sessionId}:${index + 1}`,
          sessionId: session.sessionId,
          startedAt: timestamp,
          promptPreview: previewPrompt(userText),
          callCount: 0,
          ...emptyUsage()
        };
        prompts.push(currentPrompt);
      }
      return;
    }

    if (event.type !== 'event_msg' || payload.type !== 'token_count') {
      return;
    }

    const info =
      payload.info && typeof payload.info === 'object'
        ? (payload.info as JsonObject)
        : {};
    const usage = usageFromSnakeCase(info.last_token_usage);

    if (!usage) {
      return;
    }

    if (!currentPrompt) {
      currentPrompt = {
        promptId: `${session.sessionId}:unattributed`,
        sessionId: session.sessionId,
        startedAt: timestamp,
        promptPreview: 'unattributed',
        callCount: 0,
        ...emptyUsage()
      };
      prompts.push(currentPrompt);
    }

    currentPrompt.callCount += 1;
    addUsage(currentPrompt, usage);
    tokenCalls.push({
      callId: `${session.sessionId}:${index + 1}`,
      sessionId: session.sessionId,
      promptId: currentPrompt.promptId,
      occurredAt: timestamp,
      ...usage
    });

    lastReportedTotalTokens =
      usageFromSnakeCase(info.total_token_usage)?.totalTokens ??
      lastReportedTotalTokens;
  });

  return {
    session,
    prompts,
    tokenCalls,
    validation: {
      totalTokenDelta: tokenCalls.reduce(
        (sum, call) => sum + call.totalTokens,
        0
      ),
      lastReportedTotalTokens
    }
  };
};
