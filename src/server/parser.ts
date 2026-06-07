import type {
  InputSourceCategory,
  InputSourceRecord,
  ModelMetadata,
  ParsedSession,
  PromptRecord,
  TokenUsage
} from '../shared/types.js';

type JsonObject = Record<string, unknown>;
type InputSourceAccumulator = Map<string, InputSourceRecord>;

const inputSourceLabels: Record<InputSourceCategory, string> = {
  user_prompt: 'User prompt',
  system_developer: 'System and developer',
  instructions_skills: 'Instructions and skills',
  conversation_history: 'Conversation history',
  tool_calls: 'Tool calls',
  tool_outputs: 'Tool outputs',
  compacted_history: 'Compacted history',
  runtime_metadata: 'Runtime metadata'
};

const inputSourceConfidence: Record<
  InputSourceCategory,
  InputSourceRecord['confidence']
> = {
  user_prompt: 'high',
  system_developer: 'medium',
  instructions_skills: 'medium',
  conversation_history: 'low',
  tool_calls: 'high',
  tool_outputs: 'high',
  compacted_history: 'medium',
  runtime_metadata: 'low'
};

const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0
});

const emptyModelMetadata = (): ModelMetadata => ({
  model: '',
  modelEffort: '',
  modelContextWindow: 0
});

const addInputSource = (
  accumulator: InputSourceAccumulator,
  category: InputSourceCategory,
  value: unknown,
  labelOverride?: string
): void => {
  const chars =
    typeof value === 'string'
      ? value.length
      : value === null || value === undefined
        ? 0
        : JSON.stringify(value).length;

  if (chars === 0) {
    return;
  }

  const label = labelOverride ?? inputSourceLabels[category];
  const sourceId = `${category}:${label}`;
  const existing = accumulator.get(sourceId);
  accumulator.set(sourceId, {
    sourceId,
    category,
    label,
    chars: (existing?.chars ?? 0) + chars,
    events: (existing?.events ?? 0) + 1,
    confidence: inputSourceConfidence[category]
  });
};

const mergeInputSources = (
  target: InputSourceAccumulator,
  source: InputSourceAccumulator
): void => {
  source.forEach((record) => {
    const existing = target.get(record.sourceId);
    target.set(record.sourceId, {
      ...record,
      chars: (existing?.chars ?? 0) + record.chars,
      events: (existing?.events ?? 0) + record.events
    });
  });
};

const inputSourcesFrom = (
  accumulator: InputSourceAccumulator
): InputSourceRecord[] =>
  [...accumulator.values()].sort((left, right) => right.chars - left.chars);

const addPromptInputSource = (
  prompt: PromptRecord | null,
  category: InputSourceCategory,
  value: unknown,
  labelOverride?: string
): void => {
  if (!prompt) {
    return;
  }

  const updatedSources = new Map(
    prompt.inputSources.map((source) => [source.sourceId, source])
  );
  addInputSource(updatedSources, category, value, labelOverride);
  prompt.inputSources = inputSourcesFrom(updatedSources);
};

const toolNameFromPayload = (
  payload: JsonObject,
  fallback: string
): string => {
  const rawName =
    typeof payload.name === 'string'
      ? payload.name
      : typeof payload.tool_name === 'string'
        ? payload.tool_name
        : typeof payload.namespace === 'string'
          ? payload.namespace
          : fallback;

  return rawName.trim().length > 0 ? rawName.trim() : fallback;
};

const toolCallLabel = (toolName: string): string => `Tool call: ${toolName}`;

const toolOutputLabel = (toolName: string): string => `Tool output: ${toolName}`;

const callIdFromPayload = (payload: JsonObject): string =>
  typeof payload.call_id === 'string' ? payload.call_id : '';

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

const modelMetadataFromTurnContext = (payload: JsonObject): ModelMetadata => {
  const collaborationMode =
    payload.collaboration_mode && typeof payload.collaboration_mode === 'object'
      ? (payload.collaboration_mode as JsonObject)
      : {};
  const settings =
    collaborationMode.settings && typeof collaborationMode.settings === 'object'
      ? (collaborationMode.settings as JsonObject)
      : {};
  const model =
    typeof payload.model === 'string'
      ? payload.model
      : typeof settings.model === 'string'
        ? settings.model
        : '';
  const modelEffort =
    typeof payload.effort === 'string'
      ? payload.effort
      : typeof payload.reasoning_effort === 'string'
        ? payload.reasoning_effort
        : typeof settings.reasoning_effort === 'string'
          ? settings.reasoning_effort
          : '';

  return {
    model,
    modelEffort,
    modelContextWindow: 0
  };
};

const applyModelMetadata = (
  prompt: PromptRecord,
  metadata: ModelMetadata
): void => {
  if (!prompt.model && metadata.model) {
    prompt.model = metadata.model;
  }

  if (!prompt.modelEffort && metadata.modelEffort) {
    prompt.modelEffort = metadata.modelEffort;
  }

  prompt.modelContextWindow = Math.max(
    prompt.modelContextWindow,
    metadata.modelContextWindow
  );
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
  let currentModelMetadata = emptyModelMetadata();
  const sessionContextSources: InputSourceAccumulator = new Map();
  const turnContextSources: InputSourceAccumulator = new Map();
  const rollingHistorySources: InputSourceAccumulator = new Map();
  const toolNameByCallId = new Map<string, string>();
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
      if (
        payload.base_instructions &&
        typeof payload.base_instructions === 'object'
      ) {
        addInputSource(
          sessionContextSources,
          'system_developer',
          (payload.base_instructions as JsonObject).text
        );
      }
      addInputSource(sessionContextSources, 'instructions_skills', payload.instructions);
      addInputSource(sessionContextSources, 'instructions_skills', payload.dynamic_tools);
      return;
    }

    if (event.type === 'turn_context') {
      currentModelMetadata = modelMetadataFromTurnContext(payload);
      turnContextSources.clear();
      addInputSource(
        turnContextSources,
        'system_developer',
        payload.developer_instructions
      );
      const collaborationMode =
        payload.collaboration_mode && typeof payload.collaboration_mode === 'object'
          ? (payload.collaboration_mode as JsonObject)
          : {};
      const settings =
        collaborationMode.settings && typeof collaborationMode.settings === 'object'
          ? (collaborationMode.settings as JsonObject)
          : {};
      addInputSource(
        turnContextSources,
        'system_developer',
        settings.developer_instructions
      );
      addInputSource(turnContextSources, 'instructions_skills', payload.user_instructions);
      addInputSource(
        turnContextSources,
        'runtime_metadata',
        {
          cwd: payload.cwd,
          approval_policy: payload.approval_policy,
          sandbox_policy: payload.sandbox_policy,
          model: payload.model,
          effort: payload.effort,
          summary: payload.summary
        }
      );
      return;
    }

    if (event.type === 'compacted') {
      addInputSource(
        rollingHistorySources,
        'compacted_history',
        payload.message ?? payload.replacement_history
      );
      return;
    }

    if (event.type === 'response_item') {
      const userText = extractUserInputText(payload);

      if (userText) {
        const promptSources: InputSourceAccumulator = new Map();
        mergeInputSources(promptSources, sessionContextSources);
        mergeInputSources(promptSources, turnContextSources);
        mergeInputSources(promptSources, rollingHistorySources);
        addInputSource(promptSources, 'user_prompt', userText);
        currentPrompt = {
          promptId: `${session.sessionId}:${index + 1}`,
          sessionId: session.sessionId,
          startedAt: timestamp,
          promptPreview: previewPrompt(userText),
          callCount: 0,
          inputSources: inputSourcesFrom(promptSources),
          ...currentModelMetadata,
          ...emptyUsage()
        };
        prompts.push(currentPrompt);
        addInputSource(rollingHistorySources, 'conversation_history', userText);
        return;
      }

      if (payload.type === 'message' && payload.role === 'developer') {
        addInputSource(turnContextSources, 'system_developer', payload.content);
        return;
      }

      if (payload.type === 'message' && payload.role === 'assistant') {
        addInputSource(rollingHistorySources, 'conversation_history', payload.content);
        return;
      }

      if (payload.type === 'function_call') {
        const toolName = toolNameFromPayload(payload, 'function_call');
        const callId = callIdFromPayload(payload);
        if (callId) {
          toolNameByCallId.set(callId, toolName);
        }
        addPromptInputSource(
          currentPrompt,
          'tool_calls',
          payload.arguments,
          toolCallLabel(toolName)
        );
        addInputSource(
          rollingHistorySources,
          'tool_calls',
          payload.arguments,
          toolCallLabel(toolName)
        );
        return;
      }

      if (payload.type === 'custom_tool_call') {
        const toolName = toolNameFromPayload(payload, 'custom_tool_call');
        const callId = callIdFromPayload(payload);
        if (callId) {
          toolNameByCallId.set(callId, toolName);
        }
        addPromptInputSource(
          currentPrompt,
          'tool_calls',
          payload.input,
          toolCallLabel(toolName)
        );
        addInputSource(
          rollingHistorySources,
          'tool_calls',
          payload.input,
          toolCallLabel(toolName)
        );
        return;
      }

      if (payload.type === 'function_call_output') {
        const callId = callIdFromPayload(payload);
        const toolName = callId
          ? toolNameByCallId.get(callId) ?? 'unknown'
          : 'unknown';
        addPromptInputSource(
          currentPrompt,
          'tool_outputs',
          payload.output,
          toolOutputLabel(toolName)
        );
        addInputSource(
          rollingHistorySources,
          'tool_outputs',
          payload.output,
          toolOutputLabel(toolName)
        );
        return;
      }

      if (payload.type === 'custom_tool_call_output') {
        const callId = callIdFromPayload(payload);
        const toolName = callId
          ? toolNameByCallId.get(callId) ?? 'unknown'
          : 'unknown';
        addPromptInputSource(
          currentPrompt,
          'tool_outputs',
          payload.output,
          toolOutputLabel(toolName)
        );
        addInputSource(
          rollingHistorySources,
          'tool_outputs',
          payload.output,
          toolOutputLabel(toolName)
        );
        return;
      }

      if (payload.type === 'reasoning') {
        addInputSource(rollingHistorySources, 'conversation_history', payload.summary);
        return;
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

    currentModelMetadata.modelContextWindow = toNumber(info.model_context_window);

    if (!currentPrompt) {
      currentPrompt = {
        promptId: `${session.sessionId}:unattributed`,
        sessionId: session.sessionId,
        startedAt: timestamp,
        promptPreview: 'unattributed',
        callCount: 0,
        inputSources: [],
        ...currentModelMetadata,
        ...emptyUsage()
      };
      prompts.push(currentPrompt);
    }

    applyModelMetadata(currentPrompt, currentModelMetadata);
    currentPrompt.callCount += 1;
    addUsage(currentPrompt, usage);
    tokenCalls.push({
      callId: `${session.sessionId}:${index + 1}`,
      sessionId: session.sessionId,
      promptId: currentPrompt.promptId,
      occurredAt: timestamp,
      ...currentModelMetadata,
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
