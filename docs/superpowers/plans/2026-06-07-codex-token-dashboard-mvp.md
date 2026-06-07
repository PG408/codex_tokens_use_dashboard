# Codex Token Dashboard MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app that scans Codex session JSONL history on manual refresh and visualizes token usage by time, session, and user Prompt.

**Architecture:** A Node/TypeScript API scans `/Users/bytedance/.codex/sessions/**/rollout-*.jsonl`, parses token events into session, Prompt, and token-call records, rebuilds a project-local SQLite-derived store, and exposes summary endpoints. A React/Vite dashboard renders the selected Product Design visual target, using overview-first KPI, trend, session ranking, Prompt table, and selected Prompt composition.

**Tech Stack:** Node 24, npm, TypeScript, Vite, React, Vitest, Express, sql.js, fast-glob, Recharts, lucide-react.

**Visual Target:** `/Users/bytedance/.codex/generated_images/019ea0aa-63e3-7c13-8180-08d9fa1eb595/ig_0aa9b533c142c8b0016a2517de47048191a8be8f848c633fe5.png`

---

## File Structure

- Create `package.json`: scripts and dependencies.
- Create `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`: app tooling.
- Create `src/shared/types.ts`: shared session, Prompt, token, filter, and API response types.
- Create `src/server/parser.ts`: pure JSONL event parser and Prompt attribution.
- Create `src/server/store.ts`: project-local sql.js store and aggregate queries.
- Create `src/server/api.ts`: Express app and API route handlers.
- Create `src/server/index.ts`: development server entrypoint.
- Create `src/server/__tests__/parser.test.ts`: parser and Prompt grouping tests.
- Create `src/server/__tests__/store.test.ts`: store aggregate tests.
- Create `src/client/main.tsx`: React entrypoint.
- Create `src/client/App.tsx`: dashboard state, data loading, filtering, and composition.
- Create `src/client/styles.css`: Research Workbench visual system and responsive layout.
- Create `src/client/components/*.tsx`: focused UI pieces for toolbar, KPI strip, charts, session table, Prompt table, and composition rail.

## Task 1: Scaffold Tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Modify: `.gitignore`

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json`:

```json
{
  "name": "codex-token-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/server/index.ts",
    "build": "tsc -p tsconfig.node.json && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "express": "^5.1.0",
    "fast-glob": "^3.3.3",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0",
    "sql.js": "^1.12.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/sql.js": "^1.4.9",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create TypeScript and Vite config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src/client", "src/shared"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest"]
  },
  "include": ["src/server", "src/shared", "vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4317'
    }
  }
});
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Codex Token Monitor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/client/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 4: Commit scaffold**

Run:

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html .gitignore
git commit -m "chore: scaffold token dashboard app"
```

Expected: commit succeeds.

## Task 2: Parser And Prompt Attribution

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/server/parser.ts`
- Create: `src/server/__tests__/parser.test.ts`

- [ ] **Step 1: Write parser tests**

Create `src/server/__tests__/parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseSessionJsonl } from '../parser.js';

const lines = [
  JSON.stringify({
    timestamp: '2026-06-07T01:00:00.000Z',
    type: 'session_meta',
    payload: {
      id: 'session-a',
      timestamp: '2026-06-07T00:59:00.000Z',
      cwd: '/tmp/project',
      originator: 'Codex Desktop',
      model_provider: 'openai',
      cli_version: '0.137.0'
    }
  }),
  JSON.stringify({
    timestamp: '2026-06-07T01:00:01.000Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Build the dashboard MVP' }]
    }
  }),
  JSON.stringify({
    timestamp: '2026-06-07T01:00:02.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          output_tokens: 20,
          reasoning_output_tokens: 5,
          total_tokens: 120
        },
        total_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          output_tokens: 20,
          reasoning_output_tokens: 5,
          total_tokens: 120
        }
      }
    }
  }),
  JSON.stringify({
    timestamp: '2026-06-07T01:00:03.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 50,
          cached_input_tokens: 10,
          output_tokens: 30,
          reasoning_output_tokens: 0,
          total_tokens: 80
        },
        total_token_usage: {
          input_tokens: 150,
          cached_input_tokens: 50,
          output_tokens: 50,
          reasoning_output_tokens: 5,
          total_tokens: 200
        }
      }
    }
  }),
  JSON.stringify({
    timestamp: '2026-06-07T01:00:04.000Z',
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Filter by session' }]
    }
  }),
  JSON.stringify({
    timestamp: '2026-06-07T01:00:05.000Z',
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        last_token_usage: {
          input_tokens: 25,
          cached_input_tokens: 5,
          output_tokens: 10,
          reasoning_output_tokens: 1,
          total_tokens: 35
        },
        total_token_usage: {
          input_tokens: 175,
          cached_input_tokens: 55,
          output_tokens: 60,
          reasoning_output_tokens: 6,
          total_tokens: 235
        }
      }
    }
  })
].join('\n');

describe('parseSessionJsonl', () => {
  it('groups all token calls after one user input into that Prompt', () => {
    const parsed = parseSessionJsonl(lines, '/tmp/session.jsonl');

    expect(parsed.session.sessionId).toBe('session-a');
    expect(parsed.prompts).toHaveLength(2);
    expect(parsed.prompts[0]).toMatchObject({
      promptPreview: 'Build the dashboard MVP',
      callCount: 2,
      inputTokens: 150,
      cachedInputTokens: 50,
      outputTokens: 50,
      reasoningOutputTokens: 5,
      totalTokens: 200
    });
    expect(parsed.prompts[1]).toMatchObject({
      promptPreview: 'Filter by session',
      callCount: 1,
      totalTokens: 35
    });
    expect(parsed.tokenCalls).toHaveLength(3);
    expect(parsed.validation.totalTokenDelta).toBe(235);
    expect(parsed.validation.lastReportedTotalTokens).toBe(235);
  });

  it('limits Prompt previews without storing the full input', () => {
    const longInput = 'x'.repeat(180);
    const jsonl = [
      lines.split('\n')[0],
      JSON.stringify({
        timestamp: '2026-06-07T01:00:01.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: longInput }]
        }
      })
    ].join('\n');

    const parsed = parseSessionJsonl(jsonl, '/tmp/session.jsonl');

    expect(parsed.prompts[0].promptPreview.length).toBe(120);
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run: `npm test -- src/server/__tests__/parser.test.ts`

Expected: FAIL because `src/server/parser.ts` does not exist.

- [ ] **Step 3: Implement shared types and parser**

Create `src/shared/types.ts`:

```ts
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
  trend: Array<{
    bucket: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    inputCacheHitRate: number | null;
  }>;
  sessions: Array<SessionRecord & TokenUsage & { inputCacheHitRate: number | null }>;
  prompts: Array<PromptRecord & { inputCacheHitRate: number | null; model: string }>;
};
```

Create `src/server/parser.ts`:

```ts
import type { ParsedSession, PromptRecord, TokenCallRecord, TokenUsage } from '../shared/types.js';

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

const usageFromPayload = (value: unknown): TokenUsage | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const usage = value as JsonObject;
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    cachedInputTokens: Number(usage.cached_input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    reasoningOutputTokens: Number(usage.reasoning_output_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0)
  };
};

const extractUserText = (payload: JsonObject): string | null => {
  if (payload.type !== 'message' || payload.role !== 'user' || !Array.isArray(payload.content)) {
    return null;
  }

  return payload.content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const content = item as JsonObject;
      return content.type === 'input_text' && typeof content.text === 'string' ? content.text : '';
    })
    .join('\n')
    .trim();
};

const previewPrompt = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, 120);

export const parseSessionJsonl = (jsonl: string, sourceFile: string): ParsedSession => {
  const prompts: PromptRecord[] = [];
  const tokenCalls: TokenCallRecord[] = [];
  let sessionId = sourceFile;
  let currentPrompt: PromptRecord | null = null;
  let lastSeenAt = '';
  let lastReportedTotalTokens = 0;
  const sessionDefaults = {
    startedAt: '',
    cwd: '',
    originator: '',
    modelProvider: '',
    cliVersion: ''
  };

  jsonl.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    const event = JSON.parse(line) as JsonObject;
    const timestamp = typeof event.timestamp === 'string' ? event.timestamp : '';
    lastSeenAt = timestamp || lastSeenAt;
    const payload = event.payload && typeof event.payload === 'object' ? (event.payload as JsonObject) : {};

    if (event.type === 'session_meta') {
      sessionId = String(payload.id ?? sessionId);
      sessionDefaults.startedAt = String(payload.timestamp ?? timestamp);
      sessionDefaults.cwd = String(payload.cwd ?? '');
      sessionDefaults.originator = String(payload.originator ?? '');
      sessionDefaults.modelProvider = String(payload.model_provider ?? '');
      sessionDefaults.cliVersion = String(payload.cli_version ?? '');
      return;
    }

    if (event.type === 'response_item') {
      const userText = extractUserText(payload);
      if (userText) {
        currentPrompt = {
          promptId: `${sessionId}:${index + 1}`,
          sessionId,
          startedAt: timestamp,
          promptPreview: previewPrompt(userText),
          callCount: 0,
          ...emptyUsage()
        };
        prompts.push(currentPrompt);
      }
      return;
    }

    if (event.type === 'event_msg' && payload.type === 'token_count') {
      const info = payload.info && typeof payload.info === 'object' ? (payload.info as JsonObject) : {};
      const usage = usageFromPayload(info.last_token_usage);
      const totalUsage = usageFromPayload(info.total_token_usage);
      if (!usage) {
        return;
      }
      if (!currentPrompt) {
        currentPrompt = {
          promptId: `${sessionId}:unattributed`,
          sessionId,
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
        callId: `${sessionId}:${index + 1}`,
        sessionId,
        promptId: currentPrompt.promptId,
        occurredAt: timestamp,
        ...usage
      });
      lastReportedTotalTokens = totalUsage?.totalTokens ?? lastReportedTotalTokens;
    }
  });

  const totalTokenDelta = tokenCalls.reduce((sum, call) => sum + call.totalTokens, 0);

  return {
    session: {
      sessionId,
      sourceFile,
      startedAt: sessionDefaults.startedAt,
      cwd: sessionDefaults.cwd,
      originator: sessionDefaults.originator,
      modelProvider: sessionDefaults.modelProvider,
      cliVersion: sessionDefaults.cliVersion,
      lastSeenAt
    },
    prompts,
    tokenCalls,
    validation: { totalTokenDelta, lastReportedTotalTokens }
  };
};
```

- [ ] **Step 4: Run parser tests and verify pass**

Run: `npm test -- src/server/__tests__/parser.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit parser**

Run:

```bash
git add src/shared/types.ts src/server/parser.ts src/server/__tests__/parser.test.ts
git commit -m "feat: parse Codex token sessions"
```

Expected: commit succeeds.

## Task 3: Store, Scanner, And API

**Files:**
- Create: `src/server/store.ts`
- Create: `src/server/api.ts`
- Create: `src/server/index.ts`
- Create: `src/server/__tests__/store.test.ts`

- [ ] **Step 1: Write store aggregate tests**

Create `src/server/__tests__/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDashboardStore } from '../store.js';

describe('dashboard store', () => {
  it('returns KPI, session, trend, and Prompt aggregates', async () => {
    const store = await createDashboardStore();
    store.replaceAll({
      session: {
        sessionId: 'session-a',
        sourceFile: '/tmp/a.jsonl',
        startedAt: '2026-06-07T00:00:00.000Z',
        cwd: '/tmp/project',
        originator: 'Codex Desktop',
        modelProvider: 'openai',
        cliVersion: '0.137.0',
        lastSeenAt: '2026-06-07T00:10:00.000Z'
      },
      prompts: [
        {
          promptId: 'session-a:2',
          sessionId: 'session-a',
          startedAt: '2026-06-07T00:02:00.000Z',
          promptPreview: 'Build dashboard',
          callCount: 2,
          inputTokens: 100,
          cachedInputTokens: 40,
          outputTokens: 20,
          reasoningOutputTokens: 5,
          totalTokens: 120
        }
      ],
      tokenCalls: [
        {
          callId: 'session-a:3',
          sessionId: 'session-a',
          promptId: 'session-a:2',
          occurredAt: '2026-06-07T00:02:30.000Z',
          inputTokens: 100,
          cachedInputTokens: 40,
          outputTokens: 20,
          reasoningOutputTokens: 5,
          totalTokens: 120
        }
      ],
      validation: { totalTokenDelta: 120, lastReportedTotalTokens: 120 }
    });

    const data = store.getDashboardData({});

    expect(data.kpis.totalTokens).toBe(120);
    expect(data.kpis.inputCacheHitRate).toBe(0.4);
    expect(data.kpis.sessionCount).toBe(1);
    expect(data.kpis.promptCount).toBe(1);
    expect(data.sessions[0].sessionId).toBe('session-a');
    expect(data.prompts[0].promptPreview).toBe('Build dashboard');
    expect(data.trend[0].bucket).toBe('2026-06-07');
  });
});
```

- [ ] **Step 2: Run store tests and verify failure**

Run: `npm test -- src/server/__tests__/store.test.ts`

Expected: FAIL because `src/server/store.ts` does not exist.

- [ ] **Step 3: Implement store and aggregates**

Create `src/server/store.ts` with sql.js schema, `replaceAll`, and `getDashboardData` methods. Use in-memory sql.js for tests and write exported bytes to `.data/codex-token-dashboard.sqlite` in the API refresh flow.

Key implementation requirements:

- Create `sessions`, `prompts`, and `token_calls` tables.
- On full refresh, clear all three tables inside one transaction.
- Compute cache rate as `cached_input_tokens / input_tokens`, returning `null` when input is zero.
- Exclude `prompt_preview = 'unattributed'` from default Prompt rows.
- Sort session ranking by `total_tokens desc`.
- Sort Prompt rows by `total_tokens desc`.

- [ ] **Step 4: Run store tests and verify pass**

Run: `npm test -- src/server/__tests__/store.test.ts`

Expected: PASS.

- [ ] **Step 5: Implement API server**

Create `src/server/api.ts`:

- `GET /api/dashboard`: returns current dashboard data.
- `POST /api/refresh`: scans all JSONL files, rebuilds store, returns dashboard data.
- Query parameters for `GET /api/dashboard`: `from`, `to`, `sessionId`, `q`.

Create `src/server/index.ts`:

- Starts Express on port `4317`.
- Serves Vite middleware in development.
- Opens only local host.

- [ ] **Step 6: Run server tests and type checks**

Run:

```bash
npm test
npm run lint
```

Expected: both commands pass.

- [ ] **Step 7: Commit store and API**

Run:

```bash
git add src/server/store.ts src/server/api.ts src/server/index.ts src/server/__tests__/store.test.ts
git commit -m "feat: add token dashboard API"
```

Expected: commit succeeds.

## Task 4: Research Workbench UI

**Files:**
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/styles.css`
- Create: `src/client/components/Toolbar.tsx`
- Create: `src/client/components/KpiStrip.tsx`
- Create: `src/client/components/UsageCharts.tsx`
- Create: `src/client/components/SessionRanking.tsx`
- Create: `src/client/components/PromptTable.tsx`
- Create: `src/client/components/PromptComposition.tsx`

- [ ] **Step 1: Implement client entrypoint**

Create `src/client/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Implement dashboard components**

Implement components to match the selected Research Workbench concept:

- Left sidebar with product name, nav items, data source, status, and light mode footer.
- Top toolbar with time range, session filter, Prompt summary search, Refresh button, and last refreshed timestamp.
- KPI strip with eight metrics.
- Main chart row with token usage trend and input cache hit-rate trend.
- Lower grid with session ranking, Prompt details table, and selected Prompt composition rail.

Use `lucide-react` icons for navigation and controls. Use `recharts` for line charts and donut composition.

- [ ] **Step 3: Implement App state and API calls**

Create `src/client/App.tsx` with:

- Initial `POST /api/refresh` on first load.
- `GET /api/dashboard` when filters change.
- Manual refresh button state.
- Selected Prompt state defaults to the first Prompt row.
- Table sort for Prompt total, input, output, and cache rate.

- [ ] **Step 4: Implement visual system**

Create `src/client/styles.css` using these tokens:

- Background: `#ffffff`
- Surface band: `#f7f8f8`
- Border: `#e5e7e7`
- Text: `#111414`
- Muted text: `#6b7373`
- Teal: `#08968f`
- Red: `#e23b45`
- Yellow: `#f5b82e`
- Radius: `6px`
- Base font: Inter, ui-sans-serif, system-ui

Keep typography compact and readable. Do not use nested cards, decorative blobs, marketing hero content, or large rounded containers.

- [ ] **Step 5: Build and type check**

Run:

```bash
npm run build
npm run lint
```

Expected: both commands pass.

- [ ] **Step 6: Commit UI**

Run:

```bash
git add src/client
git commit -m "feat: build Research Workbench dashboard UI"
```

Expected: commit succeeds.

## Task 5: Browser QA And Product Design Fidelity

**Files:**
- Modify as needed: `src/client/App.tsx`
- Modify as needed: `src/client/styles.css`
- Modify as needed: `src/client/components/*.tsx`

- [ ] **Step 1: Start local app**

Run: `npm run dev`

Expected: server starts on `http://localhost:4317`.

- [ ] **Step 2: Open in Browser**

Use the in-app Browser at `http://localhost:4317`.

Expected: dashboard loads with real Codex JSONL-derived data.

- [ ] **Step 3: Verify core interactions**

Check:

- Refresh button triggers a scan and updates last refreshed timestamp.
- Time range changes filter KPI, charts, session ranking, and Prompt table.
- Session filter scopes charts and Prompt table.
- Prompt summary search filters Prompt table.
- Prompt sort controls change row order.
- Selecting a Prompt updates the composition rail.

- [ ] **Step 4: Verify responsive behavior**

Check desktop and mobile-sized viewport:

- No horizontal overflow.
- Toolbar wraps cleanly.
- Tables remain readable through scroll containers.
- Composition rail moves below the table on narrow screens.

- [ ] **Step 5: Compare against visual target**

Use `view_image` on:

- Visual target: `/Users/bytedance/.codex/generated_images/019ea0aa-63e3-7c13-8180-08d9fa1eb595/ig_0aa9b533c142c8b0016a2517de47048191a8be8f848c633fe5.png`
- Latest browser screenshot.

Inspect at least:

- Sidebar structure and density.
- Top toolbar control order.
- KPI strip hierarchy.
- Trend chart placement.
- Lower grid: session ranking, Prompt table, composition rail.
- Palette, typography, radius, borders, and spacing.

- [ ] **Step 6: Fix visible drift**

Repair any mismatch that would receive a design review comment:

- Incorrect density.
- Missing composition rail.
- Overly decorative surfaces.
- Clipped table text.
- Wrong color emphasis.
- Missing selected Prompt state.

- [ ] **Step 7: Final verification**

Run:

```bash
npm test
npm run build
npm run lint
```

Expected: all commands pass.

- [ ] **Step 8: Commit QA fixes**

Run:

```bash
git add src
git commit -m "fix: align dashboard with selected visual target"
```

Expected: commit succeeds if any QA fixes were made. If no fixes were required, skip this commit.

## Self-Review

Spec coverage:

- Data source coverage: Task 2 and Task 3 scan and parse `/Users/bytedance/.codex/sessions/**/rollout-*.jsonl`.
- Prompt attribution coverage: Task 2 tests and implements one user input to many token calls.
- Manual refresh coverage: Task 3 API and Task 4 UI implement `POST /api/refresh`.
- Time, session, and Prompt breakdown coverage: Task 3 aggregate queries and Task 4 UI.
- Product Design visual target coverage: Task 4 UI and Task 5 fidelity comparison.
- Privacy coverage: Task 2 stores only `promptPreview`; no full Prompt storage is introduced.

Placeholder scan:

- No task uses unresolved labels or unspecified future work as an MVP requirement.

Type consistency:

- Shared types use camelCase in TypeScript.
- Parser maps JSON snake_case token fields into shared camelCase fields.
- API and UI consume `DashboardData`.
