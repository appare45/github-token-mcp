import type { IssuedToken, RequestedPermissions } from './github-auth.js';

export interface TokenIssuer {
    issueToken(repos: string[], permissions?: RequestedPermissions): Promise<IssuedToken>;
}
