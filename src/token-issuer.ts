import type { IssuedToken, PermissionMap } from './github-auth.js';

export interface TokenIssuer {
    issueToken(repos: string[], permissions?: PermissionMap): Promise<IssuedToken>;
}
