import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const appDataDir = (): string => {
  if (process.env.CODEX_TOKEN_DASHBOARD_DATA_DIR) {
    return resolve(process.env.CODEX_TOKEN_DASHBOARD_DATA_DIR);
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Codex Token Monitor');
  }

  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
      'Codex Token Monitor'
    );
  }

  return join(
    process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    'codex-token-monitor'
  );
};

const parsePort = (value: string | undefined): number => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : 4317;
};

export type ServerConfig = {
  codexSessionPattern: string;
  databasePath: string;
  host: string;
  port: number;
};

export const getServerConfig = (): ServerConfig => ({
  codexSessionPattern:
    process.env.CODEX_SESSION_GLOB ??
    join(homedir(), '.codex', 'sessions', '**', 'rollout-*.jsonl'),
  databasePath: join(appDataDir(), 'codex-token-dashboard.sqlite'),
  host: process.env.CODEX_TOKEN_DASHBOARD_HOST ?? '127.0.0.1',
  port: parsePort(process.env.CODEX_TOKEN_DASHBOARD_PORT)
});
