import { CHASE_DEFAULTS } from './chase.js';

// The adaptive chase settings. While this is open the pad shows the zones.
export default function ChaseSettings({ settings, onChange }) {
  const set = (field) => (e) => onChange({ ...settings, [field]: Number(e.target.value) });
  const ltr = settings.dir !== 'rtl';
  const start = ltr ? 'left' : 'right';
  const end = ltr ? 'right' : 'left';

  return (
    <div className="chase-panel">
      <p className="hint">
        Zoomed in, the page keeps your writing in view. Writing toward a side, it eases out around your pen to keep
        room ahead, so you can finish the stroke; lift in the edge zone and the line slides along. Lift near the end
        of a line and pause, and it moves on to the start of the next.
      </p>
      <div className="row">
        <div className="field">
          <span>Lines start on the</span>
          <div className="tabs small" role="group" aria-label="Lines start on">
            <button type="button" aria-pressed={ltr} onClick={() => onChange({ ...settings, dir: 'ltr' })}>left</button>
            <button type="button" aria-pressed={!ltr} onClick={() => onChange({ ...settings, dir: 'rtl' })}>right</button>
          </div>
        </div>
        <button type="button" className="quiet" onClick={() => onChange({ ...CHASE_DEFAULTS, on: settings.on })}>Reset to defaults</button>
      </div>
      <div className="controls">
        <label htmlFor="chase-edge">Edge zone</label>
        <input id="chase-edge" type="range" min="5" max="35" step="1" value={settings.edge} onChange={set('edge')} />
        <span>{settings.edge}% of the view</span>

        <label htmlFor="chase-zoom" title="How far the page may zoom out around your pen to keep room ahead while it's down">Follow while writing</label>
        <input id="chase-zoom" type="range" min="0" max="100" step="5" value={settings.zoomOut} onChange={set('zoomOut')} />
        <span>{settings.zoomOut >= 100 ? 'to the whole line' : settings.zoomOut ? `up to ${settings.zoomOut}% out` : 'off'}</span>

        <label htmlFor="chase-land">Slide writing to</label>
        <input id="chase-land" type="range" min="5" max="50" step="1" value={settings.land} onChange={set('land')} />
        <span>{settings.land}% from the edge</span>

        <label htmlFor="chase-end">End of line</label>
        <input id="chase-end" type="range" min="0" max="60" step="1" value={settings.endMm} onChange={set('endMm')} />
        <span>{settings.endMm ? `last ${settings.endMm} mm` : 'off'}</span>

        <label htmlFor="chase-pause">…after a pause of</label>
        <input id="chase-pause" type="range" min="300" max="3000" step="100" value={settings.resetMs} onChange={set('resetMs')} disabled={!settings.endMm} />
        <span>{(settings.resetMs / 1000).toFixed(1)} s</span>

        <label htmlFor="chase-grab">Return zone</label>
        <input id="chase-grab" type="range" min="0" max="25" step="1" value={settings.grab} onChange={set('grab')} />
        <span>{settings.grab ? `${settings.grab}% at the ${start}` : 'off'}</span>

        <label htmlFor="chase-margin">Lines start</label>
        <input id="chase-margin" type="range" min="0" max="40" step="1" value={settings.margin} onChange={set('margin')} />
        <span>{settings.margin} mm in from the {start}</span>
      </div>
      <p className="hint">The {end} end of the page is where a line ends; the return zone is for going back by hand.</p>
    </div>
  );
}

// The zones drawn over the pad while the settings are open.
export function ChaseZones({ settings }) {
  const start = settings.dir !== 'rtl' ? 'left' : 'right';
  return (
    <div className="chase-zones" aria-hidden="true">
      <div className="zone far" style={{ left: 0, width: `${settings.edge}%` }}><span>edge</span></div>
      <div className="zone far" style={{ right: 0, width: `${settings.edge}%` }}><span>edge</span></div>
      {settings.grab > 0 && <div className="zone near" style={{ [start]: 0, width: `${settings.grab}%` }}><span>return</span></div>}
      <div className="land" style={{ left: `${settings.land}%` }} />
      <div className="land" style={{ right: `${settings.land}%` }} />
    </div>
  );
}
