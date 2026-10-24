import { useEffect, useState } from 'react';
import { createLiveInk } from './live.js';

// A live sheet for as long as the component shows it: `spec` ({ paperKey,
// family, size, pen? }) or null; a new `id` starts a new sheet.
export function useLiveInk(spec, id) {
  const [ink, setInk] = useState(null);
  useEffect(() => {
    if (!spec) {
      setInk(null);
      return undefined;
    }
    const made = createLiveInk(spec);
    setInk(made);
    return () => made.destroy();
  }, [id, !!spec]); // eslint-disable-line react-hooks/exhaustive-deps
  return ink;
}
