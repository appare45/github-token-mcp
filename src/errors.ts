export type TokenErrorCode =
    | 'invalid_request'
    | 'repo_not_installed'
    | 'permission_escalation_denied'
    | 'key_unavailable'
    | 'github_api_error';

/**
 * Deliberately not `hono`'s `StatusCode` type — errors.ts has no HTTP
 * framework dependency. This is a plain literal union that happens to be a
 * subset of Hono's `ContentfulStatusCode`, so `app.ts` can pass it to
 * `c.text()` without a cast.
 */
export type HttpErrorStatus = 400 | 403 | 404 | 502 | 503;

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
