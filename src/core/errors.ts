// Typed domain errors mapped to HTTP status codes by the API layer.

export class AppError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400);
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(message = 'Insufficient credits') {
    super(message, 402);
  }
}

// Use 404 (not 403) so cross-org access can't tell if a record exists.
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}
