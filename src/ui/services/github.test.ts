import { describe, it, expect, vi, afterEach } from 'vitest';
import { getFile, putFile, repoFromLocation, b64encodeUtf8, b64decodeUtf8, GithubError } from './github';

const ref = { owner: 'moi', repo: 'finaryPerso', branch: 'main' };
afterEach(() => vi.unstubAllGlobals());

describe('github', () => {
  it('base64 utf8', () => { expect(b64decodeUtf8(b64encodeUtf8('é€ok'))).toBe('é€ok'); });
  it('repoFromLocation', () => {
    expect(repoFromLocation({ hostname: 'moi.github.io', pathname: '/finaryPerso/' })).toEqual({ owner: 'moi', repo: 'finaryPerso', branch: 'main' });
    expect(repoFromLocation({ hostname: 'localhost', pathname: '/' })).toBeNull();
  });
  it('getFile : 404 → null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect(await getFile(ref, 't', 'data/vault.enc')).toBeNull();
  });
  it('getFile : contenu base64', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sha: 's1', encoding: 'base64', content: b64encodeUtf8('{"a":1}') }), { status: 200 })));
    expect(await getFile(ref, 't', 'data/vault.enc')).toEqual({ sha: 's1', text: '{"a":1}' });
  });
  it('putFile envoie sha et branche, renvoie le nouveau sha', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ content: { sha: 's2' } }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await putFile(ref, 't', 'data/vault.enc', 'x', 's1', 'msg')).toBe('s2');
    const body = JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(body).toMatchObject({ sha: 's1', branch: 'main', message: 'msg', content: b64encodeUtf8('x') });
  });
  it('401 → message lisible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(putFile(ref, 't', 'p', 'x', undefined, 'm')).rejects.toBeInstanceOf(GithubError);
  });
});
