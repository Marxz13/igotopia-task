import { afterEach, describe, expect, it, vi } from 'vitest';
import { IDEMPOTENCY_KEY_HEADER, type Me } from '@/core/contract';
import { ApiError, createSearch, getJob, getMe, logout } from '@/app/lib/api';

const ME: Me = {
  user: {
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    email: 'marz@test.com',
    name: 'Marz',
  },
  orgs: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Marz Labs', credits: 10 }],
  activeOrgId: 'aaaaaaaa-0000-4000-8000-000000000001',
};

function stubFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy as unknown as typeof fetch);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('parses a 200 body against the contract schema', async () => {
    stubFetch(() => new Response(JSON.stringify(ME), { status: 200 }));
    await expect(getMe()).resolves.toEqual(ME);
  });

  it('maps a 402 error envelope to a typed ApiError the UI can branch on', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: 'insufficient_credits', message: 'no credits' }), {
          status: 402,
        }),
    );
    const err = await createSearch({ companies: ['X'], roles: [], region: '' }, 'key-1').catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(402);
    expect(err.code).toBe('insufficient_credits');
  });

  it('maps a 404 to not_found (the cross-org mask surfaces here too)', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }));
    const err = await getJob('bbbbbbbb-0000-4000-8000-000000000009').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('not_found');
  });

  it('resolves a 204 (logout) to null without parsing a body', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
  });

  it('sends the Idempotency-Key header on the credit-spending write', async () => {
    const spy = stubFetch(
      () =>
        new Response(JSON.stringify({ jobId: ME.orgs[0]!.id, status: 'queued' }), { status: 202 }),
    );
    await createSearch({ companies: ['X'], roles: [], region: '' }, 'idem-abc');
    const init = spy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers[IDEMPOTENCY_KEY_HEADER]).toBe('idem-abc');
    expect(init.method).toBe('POST');
  });

  it('maps a thrown fetch (network failure) to a network_error ApiError', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const err = await getMe().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network_error');
    expect(err.status).toBe(0);
  });
});
