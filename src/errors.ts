export type TokenErrorCode =
    | 'invalid_request'
    | 'repo_not_installed'
    | 'permission_escalation_denied'
    | 'key_unavailable'
    | 'github_api_error';

export class TokenError extends Error {
    readonly code: TokenErrorCode;

    constructor(code: TokenErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'TokenError';
    }

    toJSON(): { error: TokenErrorCode; message: string } {
        return { error: this.code, message: this.message };
    }
}

export function isTokenError(error: unknown): error is TokenError {
    return error instanceof TokenError;
}
