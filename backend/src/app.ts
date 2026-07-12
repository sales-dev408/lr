import fastify from 'fastify';
import authPlugin from './plugins/auth.js';
import securityPlugin from './plugins/security.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCardRoutes } from './routes/cards.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerVendorPublicRoutes } from './routes/vendors.js';
import { registerPassRoutes } from './routes/passes.js';
import { registerLookupRoutes } from './routes/lookup.js';
import { registerQrRoutes } from './routes/qr.js';

export async function buildApp() {
  const app = fastify({
    logger: true,
    bodyLimit: 1_000_000,
  });

  await app.register(securityPlugin);
  await app.register(authPlugin);

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerCardRoutes(app);
  await registerAdminRoutes(app);
  await registerVendorPublicRoutes(app);
  await registerPassRoutes(app);
  await registerLookupRoutes(app);
  await registerQrRoutes(app);

  return app;
}
