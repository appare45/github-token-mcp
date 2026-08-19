import { createAppAuth } from '@octokit/auth-app';
import type { components } from '@octokit/openapi-types';
import { Octokit } from '@octokit/rest';

import type { Config } from './config.js';
import { TokenError } from './errors.js';
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

/**
 * A permission request as validated by callers (e.g. `parsePermissionsFromQuery`):
 * keys are arbitrary strings (not necessarily real GitHub permission names —
 * `assertPermissionsAllowed` rejects unknown ones as 403, same as ones the
 * installation just doesn't have), values are confirmed to be PermissionLevel.
 */
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

function createUnscopedInstallationOctokit(config: Config, privateKey: string): Octokit {
    return new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId: config.appId,
            privateKey,
            installationId: config.installationId
        }
    });
}

/** Repos this installation actually covers, as `owner/repo` strings. */
export async function listInstalledRepos(config: Config, privateKey: string): Promise<string[]> {
    const octokit = createUnscopedInstallationOctokit(config, privateKey);
    try {
        const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {});
        return repos.map((repo) => repo.full_name);
    } catch (cause) {
        throw new TokenError('github_api_error', `failed to list installation repositories: ${(cause as Error).message}`);
    }
}

/** The permission set the App/installation is registered with (the ceiling callers may request within). */
export async function getInstalledPermissions(config: Config, privateKey: string): Promise<PermissionMap> {
    const appOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: { appId: config.appId, privateKey }
    });
    try {
        const { data } = await appOctokit.rest.apps.getInstallation({ installation_id: config.installationId });
        return (data.permissions ?? {}) as PermissionMap;
    } catch (cause) {
        throw new TokenError('github_api_error', `failed to read installation permissions: ${(cause as Error).message}`);
    }
}

export function assertReposCovered(requested: string[], installed: string[]): void {
    const installedSet = new Set(installed);
    const uncovered = requested.filter((repo) => !installedSet.has(repo));
    if (uncovered.length > 0) {
        throw new TokenError('repo_not_installed', `not covered by this installation: ${uncovered.join(', ')}`);
    }
}

export function assertPermissionsAllowed(requested: RequestedPermissions, granted: PermissionMap): void {
    const rank: Record<PermissionLevel, number> = { read: 1, write: 2, admin: 3 };
    for (const [permission, level] of Object.entries(requested)) {
        const grantedLevel = (granted as Record<string, PermissionLevel | undefined>)[permission];
        if (!grantedLevel || rank[level] > rank[grantedLevel]) {
            throw new TokenError('permission_escalation_denied', `requested "${permission}: ${level}" exceeds installed grant`);
        }
    }
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
            // permissions here is a caller-supplied subset validated by assertPermissionsAllowed
            // above; createAppAuth's PermissionMap type is the external-SDK boundary, so this
            // is the one place a cast is warranted.
            ...(permissions ? { permissions: permissions as PermissionMap } : {})
        });

        return {
            token: result.token,
            expiresAt: result.expiresAt,
            repos,
            permissions: (result.permissions ?? permissions ?? {}) as PermissionMap
        };
    } catch (cause) {
        throw new TokenError('github_api_error', `failed to issue installation token: ${(cause as Error).message}`);
    }
}
