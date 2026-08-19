import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';

export type TokenErrorCode =
    | 'invalid_request'
    | 'repo_not_installed'
    | 'permission_escalation_denied'
    | 'key_unavailable'
    | 'github_api_error';

/** TokenError exists to become an HTTP response, so it's fine for httpStatus to speak Hono's status type directly. */
export type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

const HTTP_STATUS: Record<TokenErrorCode, HttpErrorStatus> = {
    invalid_request: 400,
    repo_not_installed: 404,
    permission_escalation_denied: 403,
    key_unavailable: 503,
    github_api_error: 502
};

export class TokenError extends Error {
    readonly code: TokenErrorCode;
    readonly httpStatus: HttpErrorStatus;

    constructor(code: TokenErrorCode, message: string) {
        super(message);
        this.code = code;
        this.httpStatus = HTTP_STATUS[code];
        this.name = 'TokenError';
    }

    toJSON(): { error: TokenErrorCode; message: string } {
        return { error: this.code, message: this.message };
    }
}

export function isTokenError(error: unknown): error is TokenError {
    return error instanceof TokenError;
}
