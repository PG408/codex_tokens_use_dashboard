import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  App,
  dashboardQuery,
  shouldLoadBootstrapCatchUpQuery,
  timeRangeToQuery
} from '../App.js';

describe('dashboard navigation', () => {
  it('renders only the clickable MVP navigation targets', () => {
    const html = renderToStaticMarkup(createElement(App));

    expect(html).toContain('href="#overview"');
    expect(html).toContain('href="#sessions"');
    expect(html).toContain('href="#prompts"');
    expect(html).toContain('href="#composition"');
    expect(html).toContain('Overview');
    expect(html).toContain('Sessions');
    expect(html).toContain('Prompts');
    expect(html).toContain('Token Composition');
    expect(html).not.toContain('Models');
    expect(html).not.toContain('Projects');
    expect(html).not.toContain('Files');
    expect(html).not.toContain('Settings');
  });
});

describe('shouldLoadBootstrapCatchUpQuery', () => {
  it('requests the current dashboard query when filters change during bootstrap', () => {
    expect(shouldLoadBootstrapCatchUpQuery('', '?q=token')).toBe(true);
  });

  it('does not request a duplicate dashboard query after unfiltered bootstrap', () => {
    expect(shouldLoadBootstrapCatchUpQuery('', '')).toBe(false);
  });
});

describe('dashboard time filters', () => {
  it('builds a custom date range query', () => {
    expect(
      dashboardQuery('custom', { from: '2026-06-01', to: '2026-06-07' })
    ).toBe('?from=2026-06-01&to=2026-06-07');
  });

  it('does not add date filters for all available time', () => {
    expect(timeRangeToQuery('all', { from: '2026-06-01', to: '2026-06-07' }).toString()).toBe(
      ''
    );
  });
});
