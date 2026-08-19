import type { Config } from './config.js';
import { issueInstallationToken, loadPrivateKey } from './github-auth.js';
import type { TokenIssuer } from './token-issuer.js';

/**
 * Wraps the github-auth helpers behind a single-method interface, per
 * spec.md/issue#5 step 1 — callers depend on `TokenIssuer`, not on Octokit
 * or 1Password directly.
 */
export function createTokenIssuer(config: Config): TokenIssuer {
    return {
        async issueToken(repos, permissions) {
            // Logged before loadPrivateKey (which triggers the 1Password
            // desktop-app prompt) so the prompt can be judged against the
            // request that provoked it — see issue #3.
            console.log(
                `[token-request] time=${new Date().toISOString()} repos=${repos.join(',')} permissions=${JSON.stringify(permissions)}`
            );

            const privateKey = await loadPrivateKey(config);

            // Neither repo coverage nor permission grants are pre-checked here
            // — issueInstallationToken classifies GitHub's own 422 response
            // (confirmed for both cases) as request_rejected itself, so an
            // extra getInstallation call to fetch the installation's granted
            // permissions ahead of time isn't needed.
            return issueInstallationToken(config, privateKey, repos, permissions);
        }
    };
}
