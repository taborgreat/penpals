// Every drawn label, by name: src/hand/drawn/<name>.json, made in the
// handwriting studio (/hand). Bundled with the app (each is a few KB), so
// labels draw on the first paint with no requests. New files arrive by HMR.

const files = import.meta.glob('./drawn/*.json', { eager: true, import: 'default' });

export const HAND = Object.fromEntries(Object.entries(files).map(([path, asset]) => [path.match(/([^/]+)\.json$/)[1], asset]));
