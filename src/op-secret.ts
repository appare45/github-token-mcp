import { createClient, DesktopAuth } from '@1password/sdk';

import { TokenError } from './errors.js';

let clientPromise: ReturnType<typeof createClient> | undefined;

/**
 * Lazily creates a single 1Password client for the process lifetime. Using
 * `DesktopAuth` means every resolve can trigger a biometric/system-auth
 * prompt in the 1Password desktop app — human-in-the-loop approval for each
 * token issuance, per spec.md's "秘密鍵はホスト側にのみ存在する" requirement.
 */
function getClient(accountName: string) {
    clientPromise ??= createClient({
        auth: new DesktopAuth(accountName),
        integrationName: 'github-token-mcp',
        integrationVersion: '0.1.0'
    });
    return clientPromise;
}

/** Resolves a `op://vault/item/field` secret reference via the 1Password desktop app. */
export async function readSecretFromOp(reference: string, accountName: string): Promise<string> {
    try {
        const client = await getClient(accountName);
        return await client.secrets.resolve(reference);
    } catch (cause) {
        throw new TokenError('key_unavailable', `failed to read private key from 1Password: ${(cause as Error).message}`);
    }
}
