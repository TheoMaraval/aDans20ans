export const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i < 0) return [...arr, item];
  const c = [...arr]; c[i] = item; return c;
};
export const removeById = <T extends { id: string }>(arr: T[], id: string): T[] => arr.filter((x) => x.id !== id);
export const upsertDated = <T extends { date: string }>(arr: T[] | undefined, item: T): T[] =>
  [...(arr ?? []).filter((x) => x.date !== item.date), item].sort((a, b) => a.date.localeCompare(b.date));
