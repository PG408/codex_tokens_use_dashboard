export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
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

export type PromptRecord = TokenUsage & {
  promptId: string;
  sessionId: string;
  startedAt: string;
  promptPreview: string;
  callCount: number;
};

export type TokenCallRecord = TokenUsage & {
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
    PromptRecord & {
      inputCacheHitRate: number | null;
      model: string;
    }
  >;
};
