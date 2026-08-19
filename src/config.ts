function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`missing required env var: ${name}`);
    }
    return value;
}

const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

/** Comma-separated host list; empty/unset falls back to the loopback + Docker host defaults. */
function parseAllowedHosts(raw: string | undefined): string[] {
    const hosts = (raw ?? '')
        .split(',')
        .map((host) => host.trim())
        .filter((host) => host.length > 0);
    return hosts.length > 0 ? hosts : DEFAULT_ALLOWED_HOSTS;
}

export interface Config {
    /** GitHub App ID (numeric, as string in env). */
    appId: string;
    /** Fixed installation ID this server is scoped to. */
    installationId: number;
    /** 1Password secret reference, e.g. op://vault/item/private-key */
    privateKeySecretRef: string;
    /** 1Password account name shown in the desktop app sidebar (for DesktopAuth). */
    onePasswordAccount: string;
    /** Shared bearer token devcontainer clients must present. */
    bearerToken: string;
    /** Port to listen on. */
    port: number;
    /** Host header values the HTTP server accepts (DNS rebinding protection). */
    allowedHosts: string[];
    /** Optional script run (fire-and-forget) on each token request, before the 1Password prompt. */
    tokenRequestHookPath: string | undefined;
}

export function loadConfig(): Config {
    return {
        appId: requireEnv('GITHUB_APP_ID'),
        installationId: Number(requireEnv('GITHUB_APP_INSTALLATION_ID')),
        privateKeySecretRef: requireEnv('GITHUB_APP_PRIVATE_KEY_OP_REF'),
        onePasswordAccount: requireEnv('OP_ACCOUNT_NAME'),
        bearerToken: requireEnv('BEARER_TOKEN'),
        port: Number(process.env.PORT ?? '3000'),
        allowedHosts: parseAllowedHosts(process.env.ALLOWED_HOSTS),
        tokenRequestHookPath: process.env.TOKEN_REQUEST_HOOK_PATH || undefined
    };
}
