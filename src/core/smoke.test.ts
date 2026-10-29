import { describe, it, expect } from 'vitest';
describe('smoke', () => { it('webcrypto dispo', () => { expect(globalThis.crypto.subtle).toBeDefined(); }); });
