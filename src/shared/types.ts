export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type ModelMetadata = {
  model: string;
  modelEffort: string;
  modelContextWindow: number;
};

export type InputSourceCategory =
  | 'user_prompt'
  | 'system_developer'
  | 'instructions_skills'
  | 'conversation_history'
  | 'tool_calls'
  | 'tool_outputs'
  | 'compacted_history'
  | 'runtime_metadata';

export type InputSourceRecord = {
  sourceId: string;
  category: InputSourceCategory;
  label: string;
  chars: number;
  events: number;
  confidence: 'high' | 'medium' | 'low';
};

export type InputSourceEstimate = InputSourceRecord & {
  estimatedTokens: number;
  share: number;
};

export type SessionRecord = {
  sessionId: string;
  sourceFile: string;
  startedAt: string;
  cwd: string;
  originator: string;
  modelProvider: string;
  cliVersion: string;
  lastSeenAt: string;
};

export type PromptRecord = TokenUsage &
  ModelMetadata & {
  promptId: string;
  sessionId: string;
  startedAt: string;
  promptPreview: string;
  callCount: number;
  inputSources: InputSourceRecord[];
};

export type TokenCallRecord = TokenUsage &
  ModelMetadata & {
  callId: string;
  sessionId: string;
  promptId: string;
  occurredAt: string;
};

export type ParsedSession = {
  session: SessionRecord;
  prompts: PromptRecord[];
  tokenCalls: TokenCallRecord[];
  validation: {
    totalTokenDelta: number;
    lastReportedTotalTokens: number;
  };
};

export type DashboardData = {
  refreshedAt: string;
  kpis: TokenUsage & {
    inputCacheHitRate: number | null;
    sessionCount: number;
    promptCount: number;
  };
  trend: Array<
    TokenUsage & {
      bucket: string;
      inputCacheHitRate: number | null;
    }
  >;
  sessions: Array<
    SessionRecord &
      TokenUsage & {
        inputCacheHitRate: number | null;
      }
  >;
  prompts: Array<
    Omit<PromptRecord, 'inputSources'> & {
      cwd: string;
      inputSources: InputSourceEstimate[];
      inputCacheHitRate: number | null;
    }
  >;
};
