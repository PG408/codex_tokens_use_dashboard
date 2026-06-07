import type { DashboardData } from '../shared/types.js';

export type DashboardPrompt = DashboardData['prompts'][number];
export type DashboardSession = DashboardData['sessions'][number];
export type PromptSortKey =
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'inputCacheHitRate';
export type SessionSortKey =
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'inputCacheHitRate';
export type SortDirection = 'asc' | 'desc';
export type TimeRange = 'all' | '7d' | '30d';

export type SortState<T extends string> = {
  key: T;
  direction: SortDirection;
};
