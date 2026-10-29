export interface RepoRef { owner: string; repo: string; branch: string }

export class GithubError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const API = 'https://api.github.com';

export const b64encodeUtf8 = (s: string): string => {
  const u8 = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
};
export const b64decodeUtf8 = (b: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function repoFromLocation(loc: { hostname: string; pathname: string }): RepoRef | null {
  const m = loc.hostname.match(/^([\w-]+)\.github\.io$/i);
  const repo = loc.pathname.split('/').filter(Boolean)[0];
  return m && repo ? { owner: m[1], repo, branch: 'main' } : null;
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${API}${path}`, {
    ...init, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    const msg = r.status === 401 || r.status === 403 ? 'Token GitHub invalide ou sans droit d\'écriture'
      : r.status === 404 ? 'Introuvable sur GitHub'
      : r.status === 409 || r.status === 422 ? 'Conflit : le fichier a changé sur GitHub'
      : `Erreur GitHub ${r.status}`;
    throw new GithubError(r.status, msg);
  }
  return r;
}

const contents = (ref: RepoRef, path: string) => `/repos/${ref.owner}/${ref.repo}/contents/${path}`;

export async function getFile(ref: RepoRef, token: string, path: string): Promise<{ sha: string; text: string } | null> {
  try {
    const meta = await (await gh(token, `${contents(ref, path)}?ref=${encodeURIComponent(ref.branch)}`)).json();
    if (meta.encoding === 'base64' && meta.content) return { sha: meta.sha, text: b64decodeUtf8(meta.content) };
    const raw = await gh(token, `/repos/${ref.owner}/${ref.repo}/git/blobs/${meta.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    return { sha: meta.sha, text: await raw.text() };
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return null;
    throw e;
  }
}

export async function putFile(ref: RepoRef, token: string, path: string, text: string, sha: string | undefined, message: string): Promise<string> {
  const r = await gh(token, contents(ref, path), {
    method: 'PUT',
    body: JSON.stringify({ message, content: b64encodeUtf8(text), branch: ref.branch, ...(sha ? { sha } : {}) }),
  });
  return (await r.json()).content.sha;
}

/** Commit atomique de plusieurs fichiers (API Git Data). */
export async function commitFiles(ref: RepoRef, token: string, files: { path: string; text: string }[], message: string): Promise<void> {
  const base = `/repos/${ref.owner}/${ref.repo}/git`;
  const head = await (await gh(token, `${base}/ref/heads/${ref.branch}`)).json();
  const commit = await (await gh(token, `${base}/commits/${head.object.sha}`)).json();
  const tree = await (await gh(token, `${base}/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.text })) }),
  })).json();
  const next = await (await gh(token, `${base}/commits`, { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [head.object.sha] }) })).json();
  await gh(token, `${base}/refs/heads/${ref.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: next.sha }) });
}

export async function checkAccess(ref: RepoRef, token: string): Promise<boolean> {
  const j = await (await gh(token, `/repos/${ref.owner}/${ref.repo}`)).json();
  return !!j.permissions?.push;
}

/** Lance un workflow (déclencheur workflow_dispatch). Le token doit avoir la permission « Actions : Read and write ». */
export async function dispatchWorkflow(ref: RepoRef, token: string, workflow: string): Promise<void> {
  try {
    await gh(token, `/repos/${ref.owner}/${ref.repo}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: ref.branch }) });
  } catch (e) {
    if (e instanceof GithubError && (e.status === 403 || e.status === 404)) {
      throw new GithubError(e.status, 'Le token ne peut pas lancer les Actions : sur GitHub, modifie-le et ajoute la permission « Actions : Read and write ».');
    }
    throw e;
  }
}
