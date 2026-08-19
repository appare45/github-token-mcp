import type { Config } from './config.js';
import { assertPermissionsAllowed, getInstalledPermissions, issueInstallationToken, loadPrivateKey } from './github-auth.js';
import type { TokenIssuer } from './token-issuer.js';

/**
 * Wraps the github-auth helpers behind a single-method interface, per
 * spec.md/issue#5 step 1 — callers depend on `TokenIssuer`, not on Octokit
 * or 1Password directly.
 */
export function createTokenIssuer(config: Config): TokenIssuer {
    return {
        async issueToken(repos, permissions) {
            // Fetched once per call (one 1Password approval prompt) and reused below,
            // rather than re-resolved by each helper.
            const privateKey = await loadPrivateKey(config);

            if (permissions) {
                const installedPermissions = await getInstalledPermissions(config, privateKey);
                assertPermissionsAllowed(permissions, installedPermissions);
            }

            // Repo coverage isn't pre-checked here — issueInstallationToken
            // maps GitHub's 404 response to repo_not_installed itself.
            return issueInstallationToken(config, privateKey, repos, permissions);
        }
    };
}
