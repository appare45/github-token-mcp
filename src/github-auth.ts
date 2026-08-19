import { createAppAuth } from '@octokit/auth-app';
import type { components } from '@octokit/openapi-types';
import { RequestError } from '@octokit/request-error';

import type { Config } from './config.js';
import { AppError } from './errors.js';
import { readSecretFromOp } from './op-secret.js';

/** GitHub's own App permissions schema — reused instead of hand-rolling permission names. */
export type PermissionMap = components['schemas']['app-permissions'];
const PERMISSION_LEVEL_VALUES = ['read', 'write', 'admin'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVEL_VALUES)[number];
const PERMISSION_LEVEL_SET: ReadonlySet<string> = new Set<PermissionLevel>(PERMISSION_LEVEL_VALUES);

/** Type-guarded membership check — Set.prototype.has has no type predicate, so this avoids a manual cast at call sites. */
export function isPermissionLevel(value: string): value is PermissionLevel {
    return PERMISSION_LEVEL_SET.has(value);
}

/** A permission request as validated by callers (e.g. `parsePermissionsFromQuery`): arbitrary string keys, PermissionLevel values. */
export type RequestedPermissions = Record<string, PermissionLevel>;

/** Default permission grant when a caller doesn't request specific permissions, per spec.md. */
export const DEFAULT_PERMISSIONS: RequestedPermissions = { contents: 'write', issues: 'write', pull_requests: 'write' };

export interface IssuedToken {
    token: string;
    expiresAt: string;
    repos: string[];
    permissions: PermissionMap;
}

/**
 * Fetched once per `get_installation_token` call and threaded through the
 * helpers below — never cached across calls or held longer than one
 * request. Callers should fetch it exactly once per request; fetching it
 * separately in each helper would otherwise trigger a 1Password desktop-app
 * approval prompt (via DesktopAuth) once per helper instead of once per request.
 */
export async function loadPrivateKey(config: Config): Promise<string> {
    return readSecretFromOp(config.privateKeySecretRef, config.onePasswordAccount);
}

/**
 * Issues an installation access token scoped down to `repos`/`permissions`.
 * JWT signing and token exchange are delegated entirely to @octokit/auth-app.
 */
export async function issueInstallationToken(
    config: Config,
    privateKey: string,
    repos: string[],
    permissions?: RequestedPermissions
): Promise<IssuedToken> {
    const auth = createAppAuth({
        appId: config.appId,
        privateKey,
        installationId: config.installationId
    });

    try {
        const result = await auth({
            type: 'installation',
            repositoryNames: repos.map((repo) => repo.split('/').slice(1).join('/')),
            // permissions here is caller-supplied and unvalidated against
            // this installation's actual grant; createAppAuth's PermissionMap
            // type is the external-SDK boundary, so this is the one place a
            // cast is warranted.
            ...(permissions ? { permissions: permissions as PermissionMap } : {})
        });

        return {
            token: result.token,
            expiresAt: result.expiresAt,
            repos,
            permissions: (result.permissions ?? permissions ?? {}) as PermissionMap
        };
    } catch (cause) {
        // Neither repo coverage nor permission grants are pre-checked before
        // this call (see createTokenIssuer) — GitHub returns 422 for both
        // (confirmed against the live API; not the 404 its own OpenAPI spec
        // documents for repo coverage), classified here as request_rejected.
        if (cause instanceof RequestError && cause.status === 422) {
            throw new AppError('request_rejected', cause.message);
        }
        throw new AppError('github_api_error', `failed to issue installation token: ${(cause as Error).message}`);
    }
}
