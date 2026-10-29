import { describe, it, expect } from 'vitest';
import { parseCsv } from '../csv';
import { applyTradeRepublic, defaultTrMapping, parseTradeRepublic } from './traderepublic';
import { buildEngine } from '../engine';
import { emptyPriceFile } from '../prices';
import { makeVault } from '../test-fixtures';

const H = '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';
const L = (date: string, acc: string, cat: string, type: string, ac: string, name: string, sym: string, shares: string, price: string, amount: string, fee: string, tax: string, id: string) =>
  `"${date}T10:00:00Z","${date}","${acc}","${cat}","${type}","${ac}","${name}","${sym}","${shares}","${price}","${amount}","${fee}","${tax}","EUR","","","","desc, avec virgule","${id}","","","",""`;

const CSV = [H,
  L('2025-01-02', 'DEFAULT', 'CASH', 'TRANSFER_INBOUND', '', '', '', '', '', '1000.000000', '', '', 'a1'),
  L('2025-01-03', 'DEFAULT', 'CASH', 'TRANSFER_OUT', '', '', '', '', '', '-300.000000', '', '', 'a2'),
  L('2025-01-03', 'PEA', 'CASH', 'TRANSFER_IN', '', '', '', '', '', '300.000000', '', '', 'a3'),
  L('2025-01-03', 'PEA', 'TRADING', 'BUY', 'FUND', 'MSCI World Swap PEA EUR (Acc)', 'IE0002XZSHO1', '42.0000000000', '5.8530000000', '-245.83', '', '', 'a4'),
  L('2025-01-04', 'PEA', 'TRADING', 'BUY', 'STOCK', 'Sanofi', 'FR0000120578', '1.0000000000', '82.0400000000', '-82.04', '-0.41', '-0.33', 'a5'),
  L('2025-02-01', 'PEA', 'TRADING', 'SELL', 'FUND', 'MSCI World Swap PEA EUR (Acc)', 'IE0002XZSHO1', '-2.0000000000', '6.0000000000', '12.00', '-1.00', '', 'a6'),
  L('2025-02-02', 'PEA', 'CASH', 'DIVIDEND', 'STOCK', 'Sanofi', 'FR0000120578', '1.0000000000', '', '4.120000', '', '', 'a7'),
  L('2025-01-10', 'DEFAULT', 'CASH', 'CARD_TRANSACTION', '', 'CAFE', '', '', '', '-10.000000', '', '', 'c1'),
  L('2025-01-20', 'DEFAULT', 'CASH', 'CARD_TRANSACTION', '', 'RESTO', '', '', '', '-20.000000', '', '', 'c2'),
  L('2025-01-21', 'DEFAULT', 'CASH', 'CARD_ORDERING_FEE', '', '', '', '', '', '0.000000', '-5.00', '', 'c3'),
  L('2025-02-05', 'DEFAULT', 'CASH', 'CARD_TRANSACTION', '', 'X', '', '', '', '-7.000000', '', '', 'c4'),
  L('2025-02-06', 'DEFAULT', 'CASH', 'INTEREST_PAYMENT', '', '', '', '', '', '1.400000', '', '-0.45', 'i1'),
  L('2025-02-07', 'DEFAULT', 'CASH', 'BENEFITS_SAVEBACK', '', '', '', '', '', '7.620000', '', '', 's1'),
  L('2025-02-08', 'DEFAULT', 'TRADING', 'BUY', 'STOCK', 'Air Liquide', 'FR0000120073', '0.4442720000', '170.0000000000', '-75.53', '', '', 'b1'),
  L('2025-02-09', 'DEFAULT', 'CORPORATE_ACTION', 'BONUS_ISSUE', 'STOCK', 'Air Liquide', 'FR0000120073', '0.0444270000', '', '', '', '', 'b2'),
].join('\n');

describe('csv', () => {
  it('guillemets, virgules et guillemets doublés', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
  });
});

describe('Trade Republic', () => {
  const p = parseTradeRepublic(CSV);

  it('rejette un autre CSV', () => { expect(() => parseTradeRepublic('a,b\n1,2')).toThrow(/Trade Republic/); });

  it('instruments, comptes, période', () => {
    expect(p.accounts).toEqual(['PEA', 'DEFAULT']);
    expect(p.instruments.map((i) => [i.isin, i.kind])).toEqual([['IE0002XZSHO1', 'ETF'], ['FR0000120578', 'STOCK'], ['FR0000120073', 'STOCK']]);
    expect([p.from, p.to]).toEqual(['2025-01-02', '2025-02-09']);
  });

  it('achats, ventes (quantité négative), frais + taxes, attribution gratuite', () => {
    const t = Object.fromEntries(p.txs.map((x) => [x.id, x]));
    expect(t['tr:a4']).toMatchObject({ type: 'BUY', quantity: 42, fees: 0, accountKey: 'PEA', isin: 'IE0002XZSHO1' });
    expect(t['tr:a4'].unitPrice! * 42).toBeCloseTo(245.83, 6);
    expect(t['tr:a5']).toMatchObject({ type: 'BUY', quantity: 1, unitPrice: 82.04 });
    expect(t['tr:a5'].fees).toBeCloseTo(0.74, 9);
    expect(t['tr:a6']).toMatchObject({ type: 'SELL', quantity: 2, unitPrice: 6, fees: 1 });
    expect(t['tr:b2']).toMatchObject({ type: 'BUY', quantity: 0.044427, unitPrice: 0 });
  });

  it('flux de trésorerie, dividendes, intérêts, saveback', () => {
    const t = Object.fromEntries(p.txs.map((x) => [x.id, x]));
    expect(t['tr:a1']).toMatchObject({ type: 'DEPOSIT', amount: 1000, accountKey: 'DEFAULT' });
    expect(t['tr:a2']).toMatchObject({ type: 'WITHDRAWAL', amount: 300 });
    expect(t['tr:a3']).toMatchObject({ type: 'DEPOSIT', amount: 300, accountKey: 'PEA' });
    expect(t['tr:a7']).toMatchObject({ type: 'DIVIDEND', amount: 4.12, isin: 'FR0000120578' });
    expect(t['tr:i1']).toMatchObject({ type: 'INTEREST', amount: 1.4, fees: 0.45 });
    expect(t['tr:s1']).toMatchObject({ type: 'DEPOSIT', amount: 7.62 });
  });

  it('dépenses carte regroupées par mois', () => {
    const cards = p.txs.filter((x) => x.id.startsWith('tr:card:'));
    expect(cards.map((c) => [c.id, c.type, c.amount, c.date])).toEqual([
      ['tr:card:DEFAULT:2025-01', 'WITHDRAWAL', 35, '2025-01-21'],
      ['tr:card:DEFAULT:2025-02', 'WITHDRAWAL', 7, '2025-02-05'],
    ]);
    expect(p.txs.some((x) => x.id === 'tr:c1')).toBe(false);
  });

  it('import dans le vault : comptes et actifs créés, positions et cash exacts', () => {
    const r = applyTradeRepublic(makeVault(), p, defaultTrMapping(makeVault()));
    expect(r.createdAccounts).toEqual(['PEA Trade Republic', 'CTO Trade Republic']);
    expect(r.createdInstruments).toHaveLength(3);
    expect(r.added).toBe(p.txs.length);
    const e = buildEngine(r.vault, emptyPriceFile(), '2025-03-01');
    const pea = r.vault.accounts.find((a) => a.type === 'PEA')!;
    const cto = r.vault.accounts.find((a) => a.type === 'CTO')!;
    const q = (acc: string, isin: string) => e.current.positions.find((x) => x.accountId === acc && r.vault.instruments.find((i) => i.id === x.instrumentId)?.isin === isin)?.quantity;
    expect(q(pea.id, 'IE0002XZSHO1')).toBe(40);
    expect(q(cto.id, 'FR0000120073')).toBeCloseTo(0.488699, 9);
    // PEA : 300 − 245,83 − 82,78 + 11 + 4,12
    expect(e.current.cashByAccount[pea.id]).toBeCloseTo(-13.49, 6);
    // CTO : 1000 − 300 − 35 − 7 + 0,95 + 7,62 − 75,53
    expect(e.current.cashByAccount[cto.id]).toBeCloseTo(591.04, 6);
  });

  it('réimport : rien en double, le mois de carte en cours est mis à jour', () => {
    const first = applyTradeRepublic(makeVault(), p, defaultTrMapping(makeVault())).vault;
    const more = CSV + '\n' + L('2025-02-20', 'DEFAULT', 'CASH', 'CARD_TRANSACTION', '', 'Y', '', '', '', '-3.000000', '', '', 'c5')
      + '\n' + L('2025-02-21', 'PEA', 'TRADING', 'BUY', 'STOCK', 'Sanofi', 'FR0000120578', '1.0000000000', '80.0000000000', '-80.00', '', '', 'a8');
    const again = applyTradeRepublic(first, parseTradeRepublic(more), defaultTrMapping(first));
    expect(again.createdAccounts).toEqual([]);
    expect(again.createdInstruments).toEqual([]);
    expect(again.added).toBe(1);
    expect(again.updated).toBe(1);
    expect(again.vault.transactions.find((t) => t.id === 'tr:card:DEFAULT:2025-02')?.amount).toBe(10);
  });

  it('réutilise un compte et un actif existants', () => {
    const v = makeVault({
      accounts: [{ id: 'mypea', name: 'Mon PEA', type: 'PEA', institution: 'Trade Republic', currency: 'EUR' }],
      instruments: [{ id: 'w', name: 'WPEA', kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', isin: 'IE0002XZSHO1', yahooSymbol: 'WPEA.PA' }],
    });
    const m = defaultTrMapping(v);
    expect(m.PEA).toBe('mypea');
    expect(m.DEFAULT).toBe('new');
    const r = applyTradeRepublic(v, p, m);
    expect(r.vault.transactions.find((t) => t.id === 'tr:a4')?.instrumentId).toBe('w');
    expect(r.vault.transactions.find((t) => t.id === 'tr:a4')?.accountId).toBe('mypea');
  });
});
