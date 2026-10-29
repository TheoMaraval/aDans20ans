import { useState, type ReactNode } from 'react';
import { Button } from './ui';

export type FieldType = 'text' | 'number' | 'percent' | 'date' | 'select' | 'checkbox' | 'multi' | 'textarea' | 'password';
export type Values = Record<string, string | boolean | string[]>;
export interface FieldDef {
  key: string; label: string; type: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean; hint?: string; placeholder?: string;
  show?: (v: Values) => boolean;
}

const parseNum = (s: string): number => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));

export function toValues(fields: FieldDef[], obj: Record<string, unknown>): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = obj[f.key];
    if (f.type === 'checkbox') out[f.key] = !!v;
    else if (f.type === 'multi') out[f.key] = (v as string[]) ?? [];
    else if (f.type === 'percent') out[f.key] = typeof v === 'number' ? String(+(v * 100).toFixed(6)) : '';
    else if (f.type === 'number') out[f.key] = typeof v === 'number' ? String(v) : '';
    else out[f.key] = v == null ? '' : String(v);
  }
  return out;
}

export function fromValues(fields: FieldDef[], values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.show && !f.show(values)) { out[f.key] = undefined; continue; }
    if (f.type === 'checkbox') out[f.key] = !!v;
    else if (f.type === 'multi') out[f.key] = v ?? [];
    else if (f.type === 'number' || f.type === 'percent') {
      const s = String(v ?? '').trim();
      if (!s) { out[f.key] = undefined; continue; }
      const n = parseNum(s);
      if (!isFinite(n)) throw new Error(`Nombre invalide : ${f.label}`);
      out[f.key] = f.type === 'percent' ? n / 100 : n;
    } else out[f.key] = v === '' ? undefined : v;
  }
  return out;
}

export function EntityForm({ fields, initial, onSubmit, onDelete, submitLabel = 'Enregistrer', children }: {
  fields: FieldDef[]; initial: Record<string, unknown>;
  onSubmit: (v: Record<string, unknown>) => void; onDelete?: () => void; submitLabel?: string; children?: ReactNode;
}) {
  const [values, setValues] = useState<Values>(() => toValues(fields, initial));
  const [error, setError] = useState('');
  const set = (k: string, v: Values[string]) => setValues((s) => ({ ...s, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const missing = fields.filter((f) => f.required && (!f.show || f.show(values)) && (values[f.key] === '' || values[f.key] == null));
      if (missing.length) throw new Error(`Champ requis : ${missing.map((f) => f.label).join(', ')}`);
      onSubmit(fromValues(fields, values));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {fields.filter((f) => !f.show || f.show(values)).map((f) => {
        const id = `f-${f.key}`;
        const label = <label htmlFor={id} className="mb-1 block text-sm text-mute">{f.label}{f.required && <span aria-hidden> *</span>}</label>;
        const hint = f.hint && <div className="mt-1 text-xs text-mute">{f.hint}</div>;
        if (f.type === 'checkbox') return (
          <label key={f.key} className="flex items-center gap-3 py-1"><input id={id} type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} /><span>{f.label}</span></label>
        );
        if (f.type === 'multi') return (
          <fieldset key={f.key}><legend className="mb-1 text-sm text-mute">{f.label}</legend>
            <div className="flex flex-wrap gap-2">{(f.options ?? []).map((o) => {
              const on = (values[f.key] as string[]).includes(o.value);
              return <button type="button" key={o.value} onClick={() => set(f.key, on ? (values[f.key] as string[]).filter((x) => x !== o.value) : [...(values[f.key] as string[]), o.value])}
                className={`rounded-full px-3 py-1 text-sm ${on ? 'bg-accent text-white' : 'bg-surface2 text-mute'}`}>{o.label}</button>;
            })}{!f.options?.length && <span className="text-sm text-mute">—</span>}</div>{hint}</fieldset>
        );
        return (
          <div key={f.key}>
            {label}
            {f.type === 'select' ? (
              <select id={id} value={String(values[f.key])} onChange={(e) => set(f.key, e.target.value)}>
                {!f.required && <option value="">—</option>}
                {f.required && values[f.key] === '' && <option value="" disabled>Choisir…</option>}
                {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea id={id} rows={3} value={String(values[f.key])} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
            ) : (
              <div className="relative">
                <input id={id} value={String(values[f.key])} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                  type={f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text'}
                  inputMode={f.type === 'number' || f.type === 'percent' ? 'decimal' : undefined}
                  autoComplete={f.type === 'password' ? 'off' : undefined} />
                {f.type === 'percent' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute">%</span>}
              </div>
            )}
            {hint}
          </div>
        );
      })}
      {children}
      {error && <div role="alert" className="rounded-xl bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" className="flex-1">{submitLabel}</Button>
        {onDelete && <Button type="button" variant="danger" onClick={() => { if (confirm('Supprimer définitivement ?')) onDelete(); }}>Supprimer</Button>}
      </div>
    </form>
  );
}
