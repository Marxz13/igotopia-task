import type { ErrorCode } from '@/core/contract';

// Typed domain errors mapped to an HTTP status and a stable contract error code by
// the API layer (see app/api/_lib/http.ts). Throwing these from services and repos
// keeps handlers thin and makes every failure serialize to the { error, message }
// envelope the frontend branches on.

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(message: string, status: number, code: ErrorCode) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400, 'validation_error');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not signed in') {
    super(message, 401, 'unauthorized');
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(message = 'Insufficient credits') {
    super(message, 402, 'insufficient_credits');
  }
}

// Use 404 (not 403) for cross-org access: "not yours" looks the same as "doesn't
// exist", so there's no existence side-channel or id enumeration.
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'not_found');
  }
}

// Too many start-search requests for one org inside the window. Carries the ms left
// so the route can send a Retry-After and the UI can count down the cooldown.
export class RateLimitError extends AppError {
  readonly retryAfterMs: number;
  constructor(message = 'Too many requests', retryAfterMs = 0) {
    super(message, 429, 'rate_limited');
    this.retryAfterMs = retryAfterMs;
  }
}
