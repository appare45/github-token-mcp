function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`missing required env var: ${name}`);
    }
    return value;
}

export interface Config {
    /** GitHub App ID (numeric, as string in env). */
    appId: string;
    /** Fixed installation ID this MCP is scoped to. */
    installationId: number;
    /** 1Password secret reference, e.g. op://vault/item/private-key */
    privateKeySecretRef: string;
    /** 1Password account name shown in the desktop app sidebar (for DesktopAuth). */
    onePasswordAccount: string;
    /** Shared bearer token devcontainer clients must present. */
    mcpBearerToken: string;
    /** Port to listen on. */
    port: number;
}

export function loadConfig(): Config {
    return {
        appId: requireEnv('GITHUB_APP_ID'),
        installationId: Number(requireEnv('GITHUB_APP_INSTALLATION_ID')),
        privateKeySecretRef: requireEnv('GITHUB_APP_PRIVATE_KEY_OP_REF'),
        onePasswordAccount: requireEnv('OP_ACCOUNT_NAME'),
        mcpBearerToken: requireEnv('MCP_BEARER_TOKEN'),
        port: Number(process.env.PORT ?? '3000')
    };
}
