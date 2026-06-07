import { describe, expect, it } from 'vitest';
import { shouldLoadBootstrapCatchUpQuery } from '../App.js';

describe('shouldLoadBootstrapCatchUpQuery', () => {
  it('requests the current dashboard query when filters change during bootstrap', () => {
    expect(shouldLoadBootstrapCatchUpQuery('', '?q=token')).toBe(true);
  });

  it('does not request a duplicate dashboard query after unfiltered bootstrap', () => {
    expect(shouldLoadBootstrapCatchUpQuery('', '')).toBe(false);
  });
});
