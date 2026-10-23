// The colours a signature can be. Each has a shade for the light theme and one
// for the dark, plus a deeper hover tone of each; all read clearly (3.8:1 or
// better) on the site's surfaces. The ids match the backend's config.
export const SIGNATURE_COLORS = [
  { id: 'graphite', name: 'Graphite', light: '#363b47', lightHover: '#1f2229', dark: '#d4d0c6', darkHover: '#b3aea2' },
  { id: 'wax', name: 'Sealing wax', light: '#b3362a', lightHover: '#8a2519', dark: '#ec6f5a', darkHover: '#d4513d' },
  { id: 'ink', name: 'Ink blue', light: '#2b51a3', lightHover: '#1d3a7a', dark: '#8eaef0', darkHover: '#6b8fdc' },
  { id: 'forest', name: 'Forest', light: '#2d7543', lightHover: '#1f5530', dark: '#78c690', darkHover: '#57ab72' },
  { id: 'plum', name: 'Plum', light: '#7a3c9e', lightHover: '#5a2a77', dark: '#c896e6', darkHover: '#ad74d0' },
  { id: 'ochre', name: 'Ochre', light: '#9a5f0e', lightHover: '#764708', dark: '#e5ad52', darkHover: '#cc9235' },
  { id: 'teal', name: 'Teal', light: '#16757a', lightHover: '#0f5559', dark: '#62c8cd', darkHover: '#43adb2' },
  { id: 'rose', name: 'Rose', light: '#ad3a67', lightHover: '#86284d', dark: '#ef87ad', darkHover: '#d86790' },
];

const byId = new Map(SIGNATURE_COLORS.map((c) => [c.id, c]));

// CSS variables for a colour; the stylesheet picks the light or dark pair.
export function colorVars(id) {
  const c = byId.get(id) ?? SIGNATURE_COLORS[0];
  return { '--sig-l': c.light, '--sig-lh': c.lightHover, '--sig-d': c.dark, '--sig-dh': c.darkHover };
}
