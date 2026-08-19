import { execFile } from 'node:child_process';

import type { Config } from './config.js';
import { issueInstallationToken, loadPrivateKey } from './github-auth.js';
import type { TokenIssuer } from './token-issuer.js';

/**
 * Fire-and-forget: runs config.tokenRequestHookPath (if set) with repos/
 * permissions as env vars, so a user script (e.g. a macOS notification) can
 * react before the 1Password prompt. Never blocks or fails token issuance.
 */
function runTokenRequestHook(config: Config, repos: string[], permissions: Record<string, string>): void {
    if (!config.tokenRequestHookPath) {
        return;
    }
    execFile(
        config.tokenRequestHookPath,
        [],
        { env: { ...process.env, TOKEN_REQUEST_REPOS: repos.join(','), TOKEN_REQUEST_PERMISSIONS: JSON.stringify(permissions) } },
        (error) => {
            if (error) {
                console.error(`[token-request-hook] failed: ${error.message}`);
            }
        }
    );
}

/**
 * Wraps the github-auth helpers behind a single-method interface, per
 * spec.md/issue#5 step 1 — callers depend on `TokenIssuer`, not on Octokit
 * or 1Password directly.
 */
export function createTokenIssuer(config: Config): TokenIssuer {
    return {
        async issueToken(repos, permissions) {
            // Logged/hooked before loadPrivateKey (which triggers the
            // 1Password desktop-app prompt) so both can be judged against
            // the request that provoked it — see issue #3.
            const permissionsSummary = Object.entries(permissions ?? {})
                .map(([name, level]) => `${name}:${level}`)
                .join(',');
            console.log(
                `[token-request] ${new Date().toISOString()}\n  repos:       ${repos.join(',')}\n  permissions: ${permissionsSummary}`
            );
            runTokenRequestHook(config, repos, permissions ?? {});

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
