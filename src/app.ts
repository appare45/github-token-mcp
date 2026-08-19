import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';
import { validator } from 'hono/validator';

import type { Config } from './config.js';
import { isAppError } from './errors.js';
import { DEFAULT_PERMISSIONS, isPermissionLevel, type RequestedPermissions } from './github-auth.js';
import type { TokenIssuer } from './token-issuer.js';

/**
 * Validates `?<permission>=<level>` query params into a RequestedPermissions.
 * Only checks that each value is a real PermissionLevel — whether the key
 * names an actual GitHub permission and whether this installation grants it
 * is left to GitHub's own token-issuance response (see github-auth.ts),
 * which rejects both as `request_rejected` (422).
 */
const validatePermissionsQuery = validator('query', (query, c) => {
    const entries = Object.entries(query);
    if (entries.length === 0) {
        return undefined;
    }
    const permissions: RequestedPermissions = {};
    for (const [key, value] of entries) {
        if (typeof value !== 'string' || !isPermissionLevel(value)) {
            return c.text(`invalid permission level for "${key}": ${value}`, 400);
        }
        permissions[key] = value;
    }
    return permissions;
});

export function buildApp(config: Config, tokenIssuer: TokenIssuer): Hono {
    const app = new Hono();

    app.use('*', logger((str, ...rest) => console.error(str, ...rest)));

    // Bearer auth runs before the Host check so an unauthenticated caller
    // always sees 401, never learning from a 403 whether their Host header
    // was the problem.
    app.use('*', bearerAuth({ token: config.bearerToken }));

    app.use('*', async (c, next) => {
        const host = c.req.header('host')?.split(':')[0] ?? '';
        if (!config.allowedHosts.includes(host)) {
            return c.text('forbidden host', 403);
        }
        return next();
    });

    app.get('/:owner/:repo', validatePermissionsQuery, async (c) => {
        const { owner, repo } = c.req.param();
        const permissions = c.req.valid('query');

        try {
            const result = await tokenIssuer.issueToken([`${owner}/${repo}`], permissions ?? DEFAULT_PERMISSIONS);
            return c.text(result.token);
        } catch (error) {
            if (isAppError(error)) {
                return c.text(error.message, error.httpStatus);
            }
            throw error;
        }
    });

    return app;
}
