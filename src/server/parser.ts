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
type SkillMatch = {
  start: number;
  end: number;
  label: string;
  value: string;
};

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

const pluginDisplayNames: Record<string, string> = {
  browser: 'Browser',
  'build-macos-apps': 'Build macOS Apps',
  'build-web-apps': 'Build Web Apps',
  'build-web-data-visualization': 'Build Web Data Visualization',
  chrome: 'Chrome',
  'computer-use': 'Computer Use',
  'data-analytics': 'Data Analytics',
  github: 'GitHub',
  'product-design': 'Product Design',
  superpowers: 'Superpowers'
};

const pluginIdFromSkillPath = (path: string): string => {
  if (path.includes('/.codex/superpowers/skills/')) {
    return 'superpowers';
  }

  const pluginMatch = path.match(/plugins\/cache\/[^/]+\/([^/]+)\//);
  if (
    pluginMatch &&
    (pluginMatch[1] === 'openai-curated' ||
      pluginMatch[1] === 'openai-curated-remote' ||
      pluginMatch[1] === 'openai-bundled')
  ) {
    return path.match(/plugins\/cache\/[^/]+\/[^/]+\/([^/]+)\//)?.[1] ?? '';
  }

  return pluginMatch?.[1] ?? '';
};

const skillDisplayName = (name: string, path = ''): string => {
  const namePluginId = name.includes(':') ? name.split(':')[0] : '';
  const pathPluginId = pluginIdFromSkillPath(path);
  const pluginDisplay =
    pluginDisplayNames[namePluginId] ?? pluginDisplayNames[pathPluginId];

  if (pluginDisplay) {
    return pluginDisplay;
  }

  return name.includes(':') ? name.split(':')[1] : name;
};

const skillLabel = (name: string, path = ''): string =>
  `Skill: ${skillDisplayName(name.trim(), path.trim())}`;

const isRangeAvailable = (
  matches: SkillMatch[],
  start: number,
  end: number
): boolean =>
  matches.every((match) => end <= match.start || start >= match.end);

const addSkillMatch = (
  matches: SkillMatch[],
  start: number,
  end: number,
  name: string,
  path: string,
  value: string
): void => {
  const cleanName = name.trim();
  if (!cleanName || !isRangeAvailable(matches, start, end)) {
    return;
  }

  matches.push({
    start,
    end,
    label: skillLabel(cleanName, path),
    value
  });
};

const skillMatchesFromText = (text: string): SkillMatch[] => {
  const matches: SkillMatch[] = [];
  const skillBlockPattern = /<skill>[\s\S]*?<\/skill>/g;
  let skillBlock: RegExpExecArray | null;

  while ((skillBlock = skillBlockPattern.exec(text)) !== null) {
    const block = skillBlock[0];
    const name = block.match(/<name>([^<]+)<\/name>/)?.[1] ?? '';
    const path = block.match(/<path>([^<]+SKILL\.md)<\/path>/)?.[1] ?? '';
    addSkillMatch(
      matches,
      skillBlock.index,
      skillBlock.index + block.length,
      name,
      path,
      block
    );
  }

  const namePathPattern =
    /<name>([^<]+)<\/name>\s*<path>([^<]+SKILL\.md)<\/path>/g;
  let namePathMatch: RegExpExecArray | null;
  while ((namePathMatch = namePathPattern.exec(text)) !== null) {
    addSkillMatch(
      matches,
      namePathMatch.index,
      namePathMatch.index + namePathMatch[0].length,
      namePathMatch[1],
      namePathMatch[2],
      namePathMatch[0]
    );
  }

  const pathPattern = /([^\s<>"']*\/skills\/([^/\s<>"']+)\/SKILL\.md)/g;
  let pathMatch: RegExpExecArray | null;
  while ((pathMatch = pathPattern.exec(text)) !== null) {
    addSkillMatch(
      matches,
      pathMatch.index,
      pathMatch.index + pathMatch[0].length,
      pathMatch[2],
      pathMatch[1],
      pathMatch[0]
    );
  }

  const prefixedNamePattern =
    /(?:^|[\s"'`([{])([a-z0-9-]+:[a-z0-9-]+)(?=$|[\s"'`)\]}.,:;])/g;
  let prefixedNameMatch: RegExpExecArray | null;
  while ((prefixedNameMatch = prefixedNamePattern.exec(text)) !== null) {
    const name = prefixedNameMatch[1];
    const start = prefixedNameMatch.index + prefixedNameMatch[0].indexOf(name);
    addSkillMatch(
      matches,
      start,
      start + name.length,
      name,
      '',
      name
    );
  }

  return matches.sort((left, right) => left.start - right.start);
};

const addInstructionInputSource = (
  accumulator: InputSourceAccumulator,
  value: unknown,
  fallbackLabel = 'Instructions'
): void => {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value !== 'string') {
    addInputSource(accumulator, 'instructions_skills', value, fallbackLabel);
    return;
  }

  const matches = skillMatchesFromText(value);
  if (matches.length === 0) {
    addInputSource(accumulator, 'instructions_skills', value, fallbackLabel);
    return;
  }

  matches.forEach((match) => {
    addInputSource(accumulator, 'instructions_skills', match.value, match.label);
  });

  let cursor = 0;
  let remainder = '';
  matches.forEach((match) => {
    remainder += value.slice(cursor, match.start);
    cursor = match.end;
  });
  remainder += value.slice(cursor);

  if (remainder.trim().length > 0) {
    addInputSource(accumulator, 'instructions_skills', remainder, fallbackLabel);
  }
};

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
      addInstructionInputSource(sessionContextSources, payload.instructions);
      addInstructionInputSource(
        sessionContextSources,
        payload.dynamic_tools,
        'Dynamic tools'
      );
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
      addInstructionInputSource(turnContextSources, payload.user_instructions);
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
