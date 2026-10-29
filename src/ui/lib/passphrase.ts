import { useEffect, useState } from 'react';

type Zx = (p: string) => { score: number; feedback: { warning: string | null; suggestions: string[] } };
let zx: Zx | null = null;
async function load(): Promise<Zx> {
  if (zx) return zx;
  const [core, common] = await Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common')]);
  core.zxcvbnOptions.setOptions({ dictionary: common.dictionary, graphs: common.adjacencyGraphs });
  zx = core.zxcvbn as unknown as Zx;
  return zx;
}

export function usePassphraseScore(p: string): number | null {
  const [s, setS] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    if (!p) { setS(null); return; }
    load().then((z) => { if (alive) setS(z(p).score); });
    return () => { alive = false; };
  }, [p]);
  return s;
}

export const passphraseOk = (p: string, score: number | null): boolean => p.length >= 16 && (score ?? 0) >= 3;
