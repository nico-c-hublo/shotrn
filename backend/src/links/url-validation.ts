import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export const MAX_URL_LENGTH = 2048;

export interface UrlValidationContext {
  /** Lower-cased hostname of the service itself; submissions pointing here are refused. */
  readonly ownHostname: string;
}

/** Mutable because the boot sequence learns BASE_URL before any request is served. */
const context: { ownHostname: string } = { ownHostname: '' };

export function configureUrlValidation(ctx: UrlValidationContext): void {
  context.ownHostname = ctx.ownHostname.toLowerCase();
}

export type UrlRejection = { ok: true; value: string } | { ok: false; message: string };

/**
 * Boundary validation for a submitted URL (FR-002, FR-003, FR-004, FR-008).
 * Parsing uses the platform URL parser; a regex alone would not be trustworthy here.
 */
export function validateUrl(raw: unknown): UrlRejection {
  if (typeof raw !== 'string') return { ok: false, message: 'url must be a string' };

  const value = raw.trim();
  if (value === '') return { ok: false, message: 'url must not be empty' };

  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, message: `url must be at most ${MAX_URL_LENGTH} characters` };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: 'url must be a valid absolute web address (http or https)' };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { ok: false, message: 'only http and https web addresses are accepted' };
  }

  if (context.ownHostname !== '' && parsed.hostname.toLowerCase() === context.ownHostname) {
    return { ok: false, message: 'url must not point back at this shortener' };
  }

  // Stored verbatim (after trimming) so the redirect reproduces exactly what was submitted.
  return { ok: true, value };
}

export function IsHttpUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isHttpUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          return validateUrl(value).ok;
        },
        defaultMessage(args: ValidationArguments) {
          const result = validateUrl(args.value);
          return result.ok ? '' : result.message;
        },
      },
    });
  };
}
