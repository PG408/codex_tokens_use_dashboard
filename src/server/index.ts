import { createServer as createViteServer } from 'vite';
import { createDashboardApi } from './api.js';

const host = '127.0.0.1';
const port = 4317;

const start = async (): Promise<void> => {
  const app = await createDashboardApi();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      appType: 'spa',
      server: {
        middlewareMode: true
      }
    });
    app.use(vite.middlewares);
  }

  app.listen(port, host, () => {
    console.log(`Codex Token Dashboard listening on http://${host}:${port}`);
  });
};

await start();
