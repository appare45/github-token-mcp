import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import type { OAuthTokenVerifier } from '@modelcontextprotocol/express';
import { createMcpExpressApp, requireBearerAuth } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';

import { loadConfig } from './config.js';
import { buildServer } from './server.js';

const config = loadConfig();

/** Constant-time compare, guarding against length leaks too (Buffer.from is O(len), not secret-dependent). */
function isValidBearerToken(candidate: string, expected: string): boolean {
    const candidateBuf = Buffer.from(candidate);
    const expectedBuf = Buffer.from(expected);
    if (candidateBuf.length !== expectedBuf.length) {
        // Still run a same-shaped comparison so the false branch takes ~equal time either way.
        timingSafeEqual(expectedBuf, expectedBuf);
        return false;
    }
    return timingSafeEqual(candidateBuf, expectedBuf);
}

const tokenVerifier: OAuthTokenVerifier = {
    async verifyAccessToken(token): Promise<AuthInfo> {
        if (!isValidBearerToken(token, config.mcpBearerToken)) {
            throw new OAuthError(OAuthErrorCode.InvalidToken, 'unknown token');
        }
        return { token, clientId: 'devcontainer', scopes: ['mcp'], expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    }
};

const handler = createMcpHandler(() => buildServer(config));

const app = createMcpExpressApp({ allowedHosts: config.allowedHosts });
const auth = requireBearerAuth({ verifier: tokenVerifier, requiredScopes: ['mcp'] });
const nodeHandler = toNodeHandler(handler);
app.all('/mcp', auth, (req, res) => void nodeHandler(req, res, req.body));

createServer(app).listen(config.port, () => {
    console.error(`[github-token-mcp] listening on http://0.0.0.0:${config.port}/mcp`);
});

process.on('SIGINT', async () => {
    await handler.close();
    process.exit(0);
});
