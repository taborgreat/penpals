import InkWell from '../ink/InkWell.jsx';

// Together in this room (rooms.md §4–§6; room/together.js): who else is here,
// the shared sheets lying on this table and what you may do with each (and the
// seals pressed into them), what your hand holds over the table (the pen, a
// candle, the stamper), a new shared sheet on your own table, and yours lying on
// others' tables.
//   t        useTogether's result
//   myRoom   this is your own room (your table)
//   me       your name; family: your paper (a new shared sheet's); color, onColor: the table pen's ink
export default function TogetherBar({ t, myRoom, me, family, color, onColor }) {
  const here = t.sheets.map((p) => p.view.sheet);
  const elsewhere = t.mine.filter((v) => !here.includes(v.sheet) && v.on && v.on !== me);
  const writing = t.sheets.some((p) => p.mayWrite);
  if (!myRoom && !t.others.length && !t.sheets.length && !elsewhere.length) return null;
  const layOn = (view) => {
    const who = window.prompt('Lay it on whose table? (their name)');
    if (who?.trim()) t.layOn(view, who.trim().replace(/^@/, ''));
  };
  const stamper = () => {
    const who = window.prompt("Set the stamper to whose seal? (their name: it takes their signature's face)");
    if (who?.trim()) t.stamperFor(who.trim().replace(/^@/, ''));
  };
  const ownsHere = myRoom && t.sheets.some((p) => p.view.owner === me);
  return (
    <div className="journal-tools together" role="toolbar" aria-label="Together in this room">
      {t.others.length > 0 && <span className="meta here">Here: {t.others.map((b) => `@${b.name}`).join(', ')}</span>}
      {t.sheets.map((p, i) => {
        const v = p.view;
        const owned = v.owner === me;
        return (
          <span key={v.sheet} className="shared-sheet" data-sheet={v.sheet} data-lines={v.lines.length} data-grown={p.grown} data-facts={p.facts ?? undefined}>
            <span className="meta">
              {owned ? 'Your' : `@${v.owner}'s`} shared sheet{t.sheets.length > 1 ? ` ${i + 1}` : ''}
            </span>
            <button type="button" onClick={() => t.lookAt(v)} title="The eye goes to it on the table">
              {p.mayWrite ? 'Write on it' : 'Look at it'}
            </button>
            {p.mayWrite && (
              <button type="button" className="quiet" onClick={() => t.lift(v)} title="Lift your last stroke: its pigment goes, the water and the dents it left stay">
                Lift my last stroke
              </button>
            )}
            {owned && myRoom && (
              <button type="button" className="quiet" onClick={() => layOn(v)} title="Lay it on someone's table: while it lies there, they can write on it">
                Lay it on…
              </button>
            )}
            {owned && !myRoom && (
              <button type="button" className="quiet" onClick={() => t.takeBack(v)} title="Pick it up: back on your table, and their writing stops (what they wrote stays)">
                Take it back
              </button>
            )}
            {p.seals.map((x) => (
              <span key={x.n} className={`seal${x.took && !x.broken ? ' took' : ''}`} data-seal={x.n} data-took={x.took} data-broken={x.broken}>
                <span className="meta">
                  {x.name ? `@${x.name}` : 'a'}'s seal: {x.broken ? 'broken' : x.took ? 'took' : 'did not take'}
                </span>
                {owned && myRoom && x.took && !x.broken && (
                  <button type="button" className="quiet" onClick={() => t.breakSeal(v, x.n)} title="Crack the wax across it: they can no longer write here">
                    Break
                  </button>
                )}
              </span>
            ))}
          </span>
        );
      })}
      {writing && (
        <span className="hand" role="group" aria-label="In your hand, over the table">
          <button type="button" aria-pressed={t.tool === 'pen'} onClick={() => t.useTool('pen')}>
            Pen
          </button>
          <button type="button" aria-pressed={t.tool === 'wax'} onClick={() => t.useTool('wax')} title="A candle: held down over a sheet it tilts, and its wax drips where it is">
            Candle
          </button>
          {ownsHere && (
            <button
              type="button"
              aria-pressed={!!t.tool?.seal}
              onClick={stamper}
              title="The stamper, set to someone's seal: press it into warm wax on your sheet and they may write on it while it lies on your table"
            >
              {t.tool?.seal ? `Stamper: @${t.tool.seal.name}` : 'Stamper…'}
            </button>
          )}
        </span>
      )}
      {elsewhere.map((v) => (
        <span key={v.sheet} className="shared-sheet away" data-sheet={v.sheet}>
          <span className="meta">Your shared sheet, on @{v.on}'s table</span>
          <button type="button" className="quiet" onClick={() => t.takeBack(v)}>
            Take it back
          </button>
        </span>
      ))}
      {myRoom && (
        <button type="button" onClick={() => t.share(family)} title="A new sheet of your paper on your table, for writing on together">
          + A shared sheet
        </button>
      )}
      {writing && <InkWell value={color} onChange={onColor} />}
      {t.notice && (
        <span className="notice" role="status">
          {t.notice}{' '}
          <button type="button" className="quiet" onClick={t.clearNotice}>
            ok
          </button>
        </span>
      )}
    </div>
  );
}
