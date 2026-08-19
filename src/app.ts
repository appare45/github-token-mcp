import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';

import type { Config } from './config.js';
import { isTokenError, TokenError } from './errors.js';
import { DEFAULT_PERMISSIONS, PERMISSION_LEVELS, type PermissionMap } from './github-auth.js';
import type { TokenIssuer } from './token-issuer.js';

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

export function buildApp(config: Config, tokenIssuer: TokenIssuer): Hono {
    const app = new Hono();

    app.use('*', async (c, next) => {
        const host = c.req.header('host')?.split(':')[0] ?? '';
        if (!config.allowedHosts.includes(host)) {
            return c.text('forbidden host', 403);
        }
        return next();
    });

    app.use('*', bearerAuth({ token: config.bearerToken }));

    app.get('/:owner/:repo', async (c) => {
        const { owner, repo } = c.req.param();
        let permissions: PermissionMap | undefined;
        try {
            permissions = parsePermissionsFromQuery(c.req.query());
        } catch (error) {
            if (isTokenError(error)) {
                return c.text(error.message, error.httpStatus as 400);
            }
            throw error;
        }

        try {
            const result = await tokenIssuer.issueToken([`${owner}/${repo}`], permissions ?? DEFAULT_PERMISSIONS);
            return c.text(result.token);
        } catch (error) {
            if (isTokenError(error)) {
                return c.text(error.message, error.httpStatus as 400);
            }
            throw error;
        }
    });

    return app;
}
