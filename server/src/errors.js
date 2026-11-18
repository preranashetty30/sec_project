export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const badRequest = (message, fields) => new AppError(400, 'BAD_REQUEST', message, { fields });
export const unauthorized = (message = 'Please log in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = "You don't have access to this") => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new AppError(409, 'CONFLICT', message, { details });
export const gone = (message) => new AppError(410, 'GONE', message);
export const tooMany = (message, retryAfter, details) => new AppError(429, 'RATE_LIMITED', message, { retryAfter, details });
export const external = (message = 'AI is temporarily unavailable. Please try again in a minute.') =>
  new AppError(502, 'EXTERNAL', message);
export const unavailable = (message) => new AppError(503, 'UNAVAILABLE', message);
