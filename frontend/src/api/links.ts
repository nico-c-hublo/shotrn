/** Types mirror specs/001-url-shortener/contracts/openapi.yaml. */

export const EXPIRY_OPTIONS = ['never', '1h', '1d', '7d', '30d'] as const;
export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];

export const MAX_URL_LENGTH = 2048;

export interface LinkResponse {
  code: string;
  shortUrl: string;
  previewUrl: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
  status: 'active' | 'expired';
}

export interface ApiError {
  error: { code: string; message: string };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function parseError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as ApiError;
    return new ApiRequestError(
      body.error?.message ?? 'Something went wrong',
      response.status,
      body.error?.code ?? 'INTERNAL',
    );
  } catch {
    return new ApiRequestError('Something went wrong', response.status, 'INTERNAL');
  }
}

export async function createLink(url: string, expiry: ExpiryOption): Promise<LinkResponse> {
  const response = await fetch('/api/links', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(expiry === 'never' ? { url } : { url, expiry }),
  });

  if (!response.ok) throw await parseError(response);
  return (await response.json()) as LinkResponse;
}

export type PreviewResult =
  | { state: 'found'; link: LinkResponse }
  | { state: 'expired'; link: LinkResponse }
  | { state: 'not-found' };

/** A 410 still carries the link body, so the preview can explain what the link used to be. */
export async function getLink(code: string): Promise<PreviewResult> {
  const response = await fetch(`/api/links/${encodeURIComponent(code)}`);

  if (response.status === 404) return { state: 'not-found' };
  if (response.status === 410) {
    return { state: 'expired', link: (await response.json()) as LinkResponse };
  }
  if (!response.ok) throw await parseError(response);

  return { state: 'found', link: (await response.json()) as LinkResponse };
}
