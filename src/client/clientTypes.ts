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
export type TimeRange = 'all' | 'today' | '7d' | '30d' | '90d' | 'custom';

export type DateRange = {
  from: string;
  to: string;
};

export type SortState<T extends string> = {
  key: T;
  direction: SortDirection;
};
