import { describe, expect, it } from 'vitest';
import {
  dashboardQuery,
  shouldLoadBootstrapCatchUpQuery,
  timeRangeToQuery
} from '../App.js';

describe('shouldLoadBootstrapCatchUpQuery', () => {
  it('requests the current dashboard query when filters change during bootstrap', () => {
    expect(shouldLoadBootstrapCatchUpQuery('', '?q=token')).toBe(true);
  });

  it('does not request a duplicate dashboard query after unfiltered bootstrap', () => {
    expect(shouldLoadBootstrapCatchUpQuery('', '')).toBe(false);
  });
});

describe('dashboard time filters', () => {
  it('builds a custom date range query with the existing filters', () => {
    expect(
      dashboardQuery(
        'custom',
        { from: '2026-06-01', to: '2026-06-07' },
        'session-a',
        'token'
      )
    ).toBe('?from=2026-06-01&to=2026-06-07&sessionId=session-a&q=token');
  });

  it('does not add date filters for all available time', () => {
    expect(timeRangeToQuery('all', { from: '2026-06-01', to: '2026-06-07' }).toString()).toBe(
      ''
    );
  });
});
