import * as z from 'zod';

import type { Config } from '../config.js';
import { TokenError } from '../errors.js';
import {
    assertPermissionsAllowed,
    assertReposCovered,
    getInstalledPermissions,
    issueInstallationToken,
    listInstalledRepos,
    loadPrivateKey,
    type PermissionMap
} from '../github-auth.js';

export const getInstallationTokenInputSchema = z.object({
    repos: z.array(z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'expected "owner/repo"')).min(1),
    permissions: z.record(z.string(), z.enum(['read', 'write', 'admin'])).optional()
});

export type GetInstallationTokenInput = z.infer<typeof getInstallationTokenInputSchema>;

/**
 * Implements the `get_installation_token` flow from spec.md:
 * 1. verify repo coverage, 2. verify permission subset, 3-4. delegate token
 * issuance to @octokit/auth-app (private key pulled from 1Password per call).
 */
export async function getInstallationToken(config: Config, input: GetInstallationTokenInput) {
    const { repos, permissions } = input;

    // Fetched once per call (one 1Password approval prompt) and reused below,
    // rather than re-resolved by each helper.
    const privateKey = await loadPrivateKey(config);

    const installedRepos = await listInstalledRepos(config, privateKey);
    assertReposCovered(repos, installedRepos);

    if (permissions) {
        const installedPermissions = await getInstalledPermissions(config, privateKey);
        assertPermissionsAllowed(permissions as PermissionMap, installedPermissions);
    }

    return issueInstallationToken(config, privateKey, repos, permissions as PermissionMap | undefined);
}

export function isTokenError(error: unknown): error is TokenError {
    return error instanceof TokenError;
}
