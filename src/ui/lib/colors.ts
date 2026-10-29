/** Couleur rgb() d'une variable de thème (--c-<name>), lue à l'exécution pour Recharts. */
export function themeColor(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim();
  const [r, g, b] = raw.split(/\s+/);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/** Palette catégorielle lisible en clair et en sombre. */
export const SERIES = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#84cc16', '#f97316', '#64748b'];
