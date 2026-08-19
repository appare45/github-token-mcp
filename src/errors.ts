import type { ClientErrorStatusCode, ServerErrorStatusCode } from 'hono/utils/http-status';

export type AppErrorCode =
    | 'invalid_request'
    | 'repo_not_installed'
    | 'permission_escalation_denied'
    | 'key_unavailable'
    | 'github_api_error';

/** AppError exists to become an HTTP response, so it's fine for httpStatus to speak Hono's status type directly. */
export type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

const HTTP_STATUS: Readonly<Record<AppErrorCode, HttpErrorStatus>> = {
    invalid_request: 400,
    repo_not_installed: 404,
    permission_escalation_denied: 403,
    key_unavailable: 503,
    github_api_error: 502
};

export class AppError extends Error {
    readonly code: AppErrorCode;
    readonly httpStatus: HttpErrorStatus;

    constructor(code: AppErrorCode, message: string) {
        super(message);
        this.code = code;
        this.httpStatus = HTTP_STATUS[code];
        this.name = 'AppError';
    }

    toJSON(): { error: AppErrorCode; message: string } {
        return { error: this.code, message: this.message };
    }
}

export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}
