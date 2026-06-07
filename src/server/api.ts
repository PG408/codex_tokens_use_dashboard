import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import express from 'express';
import fg from 'fast-glob';
import { parseSessionJsonl } from './parser.js';
import {
  createDashboardStore,
  type DashboardFilters
} from './store.js';
import type { ServerConfig } from './config.js';

const queryValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const dashboardFiltersFromQuery = (
  query: express.Request['query']
): DashboardFilters => ({
  from: queryValue(query.from),
  to: queryValue(query.to),
  sessionId: queryValue(query.sessionId),
  q: queryValue(query.q)
});

export const createDashboardApi = async (
  config: ServerConfig
): Promise<express.Express> => {
  const app = express();
  const store = await createDashboardStore();

  app.get('/api/dashboard', (req, res) => {
    res.json(store.getDashboardData(dashboardFiltersFromQuery(req.query)));
  });

  app.post('/api/refresh', async (req, res) => {
    const sourceFiles = await fg(config.codexSessionPattern, {
      absolute: true,
      onlyFiles: true
    });
    const parsedSessions = await Promise.all(
      sourceFiles.map(async (sourceFile) =>
        parseSessionJsonl(await readFile(sourceFile, 'utf8'), sourceFile)
      )
    );

    store.replaceAll(...parsedSessions);
    await mkdir(dirname(config.databasePath), { recursive: true });
    await writeFile(config.databasePath, store.exportBytes());

    res.json(store.getDashboardData(dashboardFiltersFromQuery(req.query)));
  });

  return app;
};
