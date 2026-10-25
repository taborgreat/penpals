// The world's one panel (one-world.md, "The panel"): an empty box that opens
// and closes by context (room/panel.js says which), holding the form that fits
// what you hold or what is in front of you. Nothing is in it of its own.
export default function Panel({ title, children, wide = false }) {
  if (!children) return null;
  return (
    <aside className={`panel${wide ? ' wide' : ''}`} aria-label={title}>
      <h2 className="panel-title">{title}</h2>
      {children}
    </aside>
  );
}
