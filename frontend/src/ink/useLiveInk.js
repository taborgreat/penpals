import { useEffect, useState } from 'react';
import { createLiveInk } from './live.js';

// A live sheet for as long as the component shows it: `spec` ({ paperKey,
// family, size, pen? }) or null; a new `id` starts a new sheet. Until the new
// sheet exists this returns null, never the sheet before it: that one is
// destroyed as the id changes, and strokes written on it would go nowhere.
export function useLiveInk(spec, id) {
  const [live, setLive] = useState(null); // { id, ink }
  useEffect(() => {
    if (!spec) {
      setLive(null);
      return undefined;
    }
    const made = createLiveInk(spec);
    setLive({ id, ink: made });
    return () => made.destroy();
  }, [id, !!spec]); // eslint-disable-line react-hooks/exhaustive-deps
  return spec && live && live.id === id ? live.ink : null;
}
