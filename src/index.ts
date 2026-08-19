import { serve } from '@hono/node-server';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createTokenIssuer } from './github-token-issuer.js';

const config = loadConfig();
const tokenIssuer = createTokenIssuer(config);
const app = buildApp(config, tokenIssuer);

serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.error(`[github-token-mcp] listening on http://0.0.0.0:${info.port}`);
});
