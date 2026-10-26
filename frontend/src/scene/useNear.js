import { useEffect, useState } from 'react';

// Whether an element is near the view (in it, or within `margin` of it), held
// for `dropMs` after it leaves (cleanup-and-speed.md §5b): what is out of sight is
// not asked for, and what has been out of it a while is let go.
export const DROP_MS = 20000; // what left the view is let go after this (a glance away and back costs nothing)
export function useNear(ref, { margin = '50%', dropMs = DROP_MS } = {}) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    let timer = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        clearTimeout(timer);
        if (e.isIntersecting) setNear(true);
        else timer = setTimeout(() => setNear(false), dropMs);
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [ref, margin, dropMs]);
  return near;
}
