import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortenForm } from '../src/components/ShortenForm';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

function setup() {
  const onCreated = vi.fn();
  render(<ShortenForm onCreated={onCreated} />);
  return { onCreated, user: userEvent.setup() };
}

describe('ShortenForm', () => {
  it('blocks an empty submission without calling the API', async () => {
    const { user, onCreated } = setup();
    await user.click(screen.getByRole('button', { name: 'Shorten' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a link to shorten.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('blocks a url longer than 2048 characters client-side', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText('Long link'));
    await user.paste('https://example.com/' + 'a'.repeat(2100));
    await user.click(screen.getByRole('button', { name: 'Shorten' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('at most 2048 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders the server message when the API rejects the url', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'INVALID_URL', message: 'only http and https web addresses are accepted' },
      }),
    });

    const { user } = setup();
    await user.type(screen.getByLabelText('Long link'), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Shorten' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'only http and https web addresses are accepted',
    );
  });

  it('sends the chosen expiry and reports the created link', async () => {
    const link = {
      code: 'k9Xz2QmB7rTq4',
      shortUrl: 'http://localhost:3000/k9Xz2QmB7rTq4',
      previewUrl: 'http://localhost:3000/p/k9Xz2QmB7rTq4',
      originalUrl: 'https://example.com/',
      createdAt: '2026-09-24T12:00:00.000Z',
      expiresAt: '2026-09-25T12:00:00.000Z',
      status: 'active',
    };
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => link });

    const { user, onCreated } = setup();
    await user.type(screen.getByLabelText('Long link'), 'https://example.com/');
    await user.selectOptions(screen.getByLabelText('Expiry'), '1d');
    await user.click(screen.getByRole('button', { name: 'Shorten' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(link));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ url: 'https://example.com/', expiry: '1d' });
  });

  it('omits expiry entirely when the link is permanent', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

    const { user } = setup();
    await user.type(screen.getByLabelText('Long link'), 'https://example.com/');
    await user.click(screen.getByRole('button', { name: 'Shorten' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ url: 'https://example.com/' });
  });
});
