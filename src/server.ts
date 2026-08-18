import { McpServer } from '@modelcontextprotocol/server';

import type { Config } from './config.js';
import { getInstallationToken, getInstallationTokenInputSchema, isTokenError } from './tools/get-installation-token.js';

export function buildServer(config: Config): McpServer {
    const server = new McpServer({ name: 'github-token-mcp', version: '0.1.0' });

    server.registerTool(
        'get_installation_token',
        {
            description: '指定リポジトリに対する GitHub App installation access token を発行する',
            inputSchema: getInstallationTokenInputSchema
        },
        async (input) => {
            try {
                const result = await getInstallationToken(config, input);
                return { content: [{ type: 'text', text: JSON.stringify(result) }] };
            } catch (error) {
                if (isTokenError(error)) {
                    return { content: [{ type: 'text', text: JSON.stringify(error.toJSON()) }], isError: true };
                }
                throw error;
            }
        }
    );

    return server;
}
