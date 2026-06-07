import { resolve } from 'node:path';
import express from 'express';
import { createDashboardApi } from './api.js';
import { getServerConfig } from './config.js';

const clientDistPath = resolve('dist');

const start = async (): Promise<void> => {
  const config = getServerConfig();
  const app = await createDashboardApi(config);

  if (process.env.NODE_ENV === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      appType: 'spa',
      server: {
        middlewareMode: true
      }
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(clientDistPath));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(resolve(clientDistPath, 'index.html'));
        return;
      }

      next();
    });
  }

  app.listen(config.port, config.host, () => {
    console.log(
      `Codex Token Dashboard listening on http://${config.host}:${config.port}`
    );
    console.log(`Reading sessions from ${config.codexSessionPattern}`);
  });
};

await start();
