import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import initSqlJs from 'sql.js';
import type { Database, ParamsObject, SqlValue, Statement } from 'sql.js';
import type {
  DashboardData,
  ParsedSession,
  PromptRecord,
  SessionRecord,
  TokenCallRecord,
  TokenUsage
} from '../shared/types.js';

export type DashboardFilters = {
  from?: string;
  to?: string;
  sessionId?: string;
  q?: string;
};

type DashboardStore = {
  replaceAll: (...parsedSessions: ParsedSession[]) => void;
  getDashboardData: (filters?: DashboardFilters) => DashboardData;
  exportBytes: () => Uint8Array;
};

type SqlRow = Record<string, SqlValue>;

const require = createRequire(import.meta.url);
const sqlWasmDir = dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
const sqlModule = initSqlJs({
  locateFile: (file) => join(sqlWasmDir, file)
});

const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0
});

const cacheRate = (
  cachedInputTokens: number,
  inputTokens: number
): number | null => (inputTokens === 0 ? null : cachedInputTokens / inputTokens);

const numberValue = (value: SqlValue): number =>
  typeof value === 'number' ? value : 0;

const stringValue = (value: SqlValue): string =>
  typeof value === 'string' ? value : '';

const usageFromRow = (row: SqlRow): TokenUsage => ({
  inputTokens: numberValue(row.inputTokens),
  cachedInputTokens: numberValue(row.cachedInputTokens),
  outputTokens: numberValue(row.outputTokens),
  reasoningOutputTokens: numberValue(row.reasoningOutputTokens),
  totalTokens: numberValue(row.totalTokens)
});

const createSchema = (db: Database): void => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      started_at TEXT NOT NULL,
      cwd TEXT NOT NULL,
      originator TEXT NOT NULL,
      model_provider TEXT NOT NULL,
      cli_version TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts (
      prompt_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      prompt_preview TEXT NOT NULL,
      call_count INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_calls (
      call_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      prompt_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      cached_input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      reasoning_output_tokens INTEGER NOT NULL,
      total_tokens INTEGER NOT NULL
    );
  `);
};

const runStatement = <T>(
  db: Database,
  sql: string,
  values: T[],
  bind: (statement: Statement, value: T) => void
): void => {
  const statement = db.prepare(sql);
  try {
    values.forEach((value) => bind(statement, value));
  } finally {
    statement.free();
  }
};

const queryRows = (
  db: Database,
  sql: string,
  params: ParamsObject = {}
): SqlRow[] => {
  const result = db.exec(sql, params)[0];

  if (!result) {
    return [];
  }

  return result.values.map((values) =>
    Object.fromEntries(
      result.columns.map((column, index) => [column, values[index]])
    )
  );
};

const bindFilters = (filters: DashboardFilters): {
  whereSql: string;
  params: ParamsObject;
} => {
  const clauses = ['1 = 1'];
  const params: ParamsObject = {};

  if (filters.from) {
    clauses.push('tc.occurred_at >= $from');
    params.$from = filters.from;
  }

  if (filters.to) {
    clauses.push('tc.occurred_at <= $to');
    params.$to = filters.to;
  }

  if (filters.sessionId) {
    clauses.push('tc.session_id = $sessionId');
    params.$sessionId = filters.sessionId;
  }

  if (filters.q) {
    clauses.push('p.prompt_preview LIKE $q');
    params.$q = `%${filters.q}%`;
  }

  return {
    whereSql: clauses.join(' AND '),
    params
  };
};

const usageSelect = `
  COALESCE(SUM(tc.input_tokens), 0) AS inputTokens,
  COALESCE(SUM(tc.cached_input_tokens), 0) AS cachedInputTokens,
  COALESCE(SUM(tc.output_tokens), 0) AS outputTokens,
  COALESCE(SUM(tc.reasoning_output_tokens), 0) AS reasoningOutputTokens,
  COALESCE(SUM(tc.total_tokens), 0) AS totalTokens
`;

const insertSession = (statement: Statement, session: SessionRecord): void => {
  statement.run([
    session.sessionId,
    session.sourceFile,
    session.startedAt,
    session.cwd,
    session.originator,
    session.modelProvider,
    session.cliVersion,
    session.lastSeenAt
  ]);
};

const insertPrompt = (statement: Statement, prompt: PromptRecord): void => {
  statement.run([
    prompt.promptId,
    prompt.sessionId,
    prompt.startedAt,
    prompt.promptPreview,
    prompt.callCount,
    prompt.inputTokens,
    prompt.cachedInputTokens,
    prompt.outputTokens,
    prompt.reasoningOutputTokens,
    prompt.totalTokens
  ]);
};

const insertTokenCall = (
  statement: Statement,
  tokenCall: TokenCallRecord
): void => {
  statement.run([
    tokenCall.callId,
    tokenCall.sessionId,
    tokenCall.promptId,
    tokenCall.occurredAt,
    tokenCall.inputTokens,
    tokenCall.cachedInputTokens,
    tokenCall.outputTokens,
    tokenCall.reasoningOutputTokens,
    tokenCall.totalTokens
  ]);
};

export const createDashboardStore = async (): Promise<DashboardStore> => {
  const SQL = await sqlModule;
  const db = new SQL.Database();
  let refreshedAt = new Date(0).toISOString();

  createSchema(db);

  const replaceAll = (...parsedSessions: ParsedSession[]): void => {
    db.run('BEGIN');
    try {
      db.run('DELETE FROM token_calls');
      db.run('DELETE FROM prompts');
      db.run('DELETE FROM sessions');

      runStatement(
        db,
        `INSERT INTO sessions (
          session_id,
          source_file,
          started_at,
          cwd,
          originator,
          model_provider,
          cli_version,
          last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        parsedSessions.map((parsed) => parsed.session),
        insertSession
      );
      runStatement(
        db,
        `INSERT INTO prompts (
          prompt_id,
          session_id,
          started_at,
          prompt_preview,
          call_count,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          reasoning_output_tokens,
          total_tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        parsedSessions.flatMap((parsed) => parsed.prompts),
        insertPrompt
      );
      runStatement(
        db,
        `INSERT INTO token_calls (
          call_id,
          session_id,
          prompt_id,
          occurred_at,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          reasoning_output_tokens,
          total_tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        parsedSessions.flatMap((parsed) => parsed.tokenCalls),
        insertTokenCall
      );

      db.run('COMMIT');
      refreshedAt = new Date().toISOString();
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  };

  const getDashboardData = (filters: DashboardFilters = {}): DashboardData => {
    const { whereSql, params } = bindFilters(filters);
    const kpiRow =
      queryRows(
        db,
        `
          SELECT
            ${usageSelect},
            COUNT(DISTINCT tc.session_id) AS sessionCount,
            COUNT(DISTINCT CASE
              WHEN p.prompt_preview != 'unattributed' THEN p.prompt_id
            END) AS promptCount
          FROM token_calls tc
          JOIN prompts p ON p.prompt_id = tc.prompt_id
          WHERE ${whereSql}
        `,
        params
      )[0] ?? {};
    const kpiUsage = usageFromRow(kpiRow);

    const trend = queryRows(
      db,
      `
        SELECT
          substr(tc.occurred_at, 1, 10) AS bucket,
          ${usageSelect}
        FROM token_calls tc
        JOIN prompts p ON p.prompt_id = tc.prompt_id
        WHERE ${whereSql}
        GROUP BY bucket
        ORDER BY bucket ASC
      `,
      params
    ).map((row) => {
      const usage = usageFromRow(row);
      return {
        bucket: stringValue(row.bucket),
        ...usage,
        inputCacheHitRate: cacheRate(
          usage.cachedInputTokens,
          usage.inputTokens
        )
      };
    });

    const sessions = queryRows(
      db,
      `
        SELECT
          s.session_id AS sessionId,
          s.source_file AS sourceFile,
          s.started_at AS startedAt,
          s.cwd,
          s.originator,
          s.model_provider AS modelProvider,
          s.cli_version AS cliVersion,
          s.last_seen_at AS lastSeenAt,
          ${usageSelect}
        FROM token_calls tc
        JOIN prompts p ON p.prompt_id = tc.prompt_id
        JOIN sessions s ON s.session_id = tc.session_id
        WHERE ${whereSql}
        GROUP BY s.session_id
        ORDER BY totalTokens DESC, s.last_seen_at DESC
      `,
      params
    ).map((row) => {
      const usage = usageFromRow(row);
      return {
        sessionId: stringValue(row.sessionId),
        sourceFile: stringValue(row.sourceFile),
        startedAt: stringValue(row.startedAt),
        cwd: stringValue(row.cwd),
        originator: stringValue(row.originator),
        modelProvider: stringValue(row.modelProvider),
        cliVersion: stringValue(row.cliVersion),
        lastSeenAt: stringValue(row.lastSeenAt),
        ...usage,
        inputCacheHitRate: cacheRate(
          usage.cachedInputTokens,
          usage.inputTokens
        )
      };
    });

    const prompts = queryRows(
      db,
      `
        SELECT
          p.prompt_id AS promptId,
          p.session_id AS sessionId,
          p.started_at AS startedAt,
          p.prompt_preview AS promptPreview,
          COUNT(tc.call_id) AS callCount,
          s.model_provider AS model,
          ${usageSelect}
        FROM token_calls tc
        JOIN prompts p ON p.prompt_id = tc.prompt_id
        JOIN sessions s ON s.session_id = tc.session_id
        WHERE ${whereSql}
          AND p.prompt_preview != 'unattributed'
        GROUP BY p.prompt_id
        ORDER BY totalTokens DESC, p.started_at DESC
      `,
      params
    ).map((row) => {
      const usage = usageFromRow(row);
      return {
        promptId: stringValue(row.promptId),
        sessionId: stringValue(row.sessionId),
        startedAt: stringValue(row.startedAt),
        promptPreview: stringValue(row.promptPreview),
        callCount: numberValue(row.callCount),
        ...usage,
        inputCacheHitRate: cacheRate(
          usage.cachedInputTokens,
          usage.inputTokens
        ),
        model: stringValue(row.model)
      };
    });

    return {
      refreshedAt,
      kpis: {
        ...kpiUsage,
        inputCacheHitRate: cacheRate(
          kpiUsage.cachedInputTokens,
          kpiUsage.inputTokens
        ),
        sessionCount: numberValue(kpiRow.sessionCount),
        promptCount: numberValue(kpiRow.promptCount)
      },
      trend,
      sessions,
      prompts
    };
  };

  return {
    replaceAll,
    getDashboardData,
    exportBytes: () => db.export()
  };
};
