import { timingSafeEqual } from 'node:crypto';

import { Hono } from 'hono';

import type { Config } from './config.js';
import { isTokenError, TokenError, type TokenErrorCode } from './errors.js';
import type { PermissionMap } from './github-auth.js';
import type { TokenIssuer } from './token-issuer.js';

const DEFAULT_PERMISSIONS: PermissionMap = { contents: 'write', issues: 'write', pull_requests: 'write' };
const PERMISSION_LEVELS = new Set(['read', 'write', 'admin']);

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

/** Parses `?<permission>=<level>` query params into a PermissionMap, or throws a TokenError on bad input. */
function parsePermissionsFromQuery(query: Record<string, string>): PermissionMap | undefined {
    const entries = Object.entries(query);
    if (entries.length === 0) {
        return undefined;
    }
    const permissions: Record<string, string> = {};
    for (const [key, value] of entries) {
        if (!PERMISSION_LEVELS.has(value)) {
            throw new TokenError('invalid_request', `invalid permission level for "${key}": ${value}`);
        }
        permissions[key] = value;
    }
    return permissions as PermissionMap;
}

const ERROR_STATUS: Record<TokenErrorCode, number> = {
    invalid_request: 400,
    repo_not_installed: 404,
    permission_escalation_denied: 403,
    key_unavailable: 503,
    github_api_error: 502
};

export function buildApp(config: Config, tokenIssuer: TokenIssuer): Hono {
    const app = new Hono();

    app.use('*', async (c, next) => {
        const host = c.req.header('host')?.split(':')[0] ?? '';
        if (!config.allowedHosts.includes(host)) {
            return c.text('forbidden host', 403);
        }
        return next();
    });

    app.use('*', async (c, next) => {
        const auth = c.req.header('authorization') ?? '';
        const [scheme, token] = auth.split(' ');
        if (scheme !== 'Bearer' || !token || !isValidBearerToken(token, config.bearerToken)) {
            return c.text('unauthorized', 401);
        }
        return next();
    });

    app.get('/:owner/:repo', async (c) => {
        const { owner, repo } = c.req.param();
        let permissions: PermissionMap | undefined;
        try {
            permissions = parsePermissionsFromQuery(c.req.query());
        } catch (error) {
            if (isTokenError(error)) {
                return c.text(error.message, ERROR_STATUS[error.code] as 400);
            }
            throw error;
        }

        try {
            const result = await tokenIssuer.issueToken([`${owner}/${repo}`], permissions ?? DEFAULT_PERMISSIONS);
            return c.text(result.token);
        } catch (error) {
            if (isTokenError(error)) {
                return c.text(error.message, ERROR_STATUS[error.code] as 400);
            }
            throw error;
        }
    });

    return app;
}
