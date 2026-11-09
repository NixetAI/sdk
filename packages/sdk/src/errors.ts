/**
 * Errors the SDK raises.
 *
 * Subclasses exist per status so callers can branch on the kind of failure
 * rather than parse a message: a rate limit is worth retrying, a permission
 * problem is not.
 */
export class NixetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class APIError extends NixetError {
  readonly status: number;
  /** Correlates a report with a server-side log entry. */
  readonly requestId: string | null;

  constructor(status: number, message: string, requestId: string | null) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }

  /** Build the most specific error class the status warrants. */
  static from(status: number, message: string, requestId: string | null): APIError {
    switch (status) {
      case 400:
        return new BadRequestError(status, message, requestId);
      case 401:
        return new AuthenticationError(status, message, requestId);
      case 403:
        return new PermissionError(status, message, requestId);
      case 404:
        return new NotFoundError(status, message, requestId);
      case 409:
        return new ConflictError(status, message, requestId);
      case 429:
        return new RateLimitError(status, message, requestId);
      default:
        return status >= 500
          ? new ServerError(status, message, requestId)
          : new APIError(status, message, requestId);
    }
  }
}

export class BadRequestError extends APIError {}
export class AuthenticationError extends APIError {}
export class PermissionError extends APIError {}
export class NotFoundError extends APIError {}
export class ConflictError extends APIError {}
export class RateLimitError extends APIError {}
export class ServerError extends APIError {}

/** The API was unreachable, which is different from the API refusing. */
export class ConnectionError extends NixetError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
