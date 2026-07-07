import { buildApp } from './app.js';
import { config } from './config.js';

async function start(): Promise<void> {
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
}

void start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
