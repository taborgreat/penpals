import { useState } from 'react';
import Hand from './Hand.jsx';

const ORDER = ['auto', 'dark', 'light'];
const KEY = 'penpals.theme';

// Auto (follow the system), dark or light; remembered on this device. Drawn
// things (handwritten labels, signatures) listen for 'penpals:theme' to
// redraw in the new colours.
export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'auto');

  function next() {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch { /* not remembered */ }
    setTheme(t);
    window.dispatchEvent(new Event('penpals:theme'));
  }

  return (
    <button type="button" className="quiet theme-toggle" onClick={next} title="Colour theme: auto follows your system">
      {theme === 'auto' ? <>◐ <Hand>Auto</Hand></> : theme === 'dark' ? <>☾ <Hand>Dark</Hand></> : <>☀ <Hand>Light</Hand></>}
    </button>
  );
}
