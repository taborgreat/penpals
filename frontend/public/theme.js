// The theme you picked (light/dark), before anything paints; otherwise it follows the system.
// A file rather than an inline script, so the page's CSP can be script-src 'self'.
try { const t = localStorage.getItem('penpals.theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch {}
