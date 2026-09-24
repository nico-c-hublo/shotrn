/**
 * Stable, safe error codes returned to clients. They match the ErrorEnvelope enum in
 * specs/001-url-shortener/contracts/openapi.yaml.
 *
 * There is deliberately no GONE code: an expired link is a resource state, not an error.
 * 410 responses carry a LinkResponse with status 'expired' (JSON) or the expired HTML page.
 */
export type ErrorCode =
  'INVALID_URL' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL';

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string };
}

export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }

  toEnvelope(): ErrorEnvelope {
    return { error: { code: this.code, message: this.message } };
  }
}

export class InvalidUrlError extends DomainError {
  readonly code = 'INVALID_URL' as const;
  readonly status = 400;
}

export class LinkNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
  readonly status = 404;

  constructor(message = 'Link not found') {
    super(message);
  }
}
