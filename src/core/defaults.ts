import { parseVault } from './schema';
import type { Vault } from './types';

export const emptyVault = (): Vault => parseVault({ version: 1 });
export const newId = (): string => globalThis.crypto.randomUUID();
