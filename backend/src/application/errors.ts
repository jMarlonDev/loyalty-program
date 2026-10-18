export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503;

export class AppError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
