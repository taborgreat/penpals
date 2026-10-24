import { CHASE_DEFAULTS } from './chase.js';

// The chase settings: every knob of the chase (chase.js), changed live and
// remembered on this device, so they can be felt out on the phone.
// `onChange(patch)` changes some of them.
export default function ChaseSettings({ settings, onChange }) {
  const num =
    (field, k = 1) =>
    (e) =>
      onChange({ [field]: Number(e.target.value) / k });
  const view = settings.RESET_EDGE === 'view';

  return (
    <div className="chase-panel">
      <p className="hint">
        Chase zooms in on your line, full screen, and the page slides along under your pen as you move right inside the chase zone, at your own rate. Lift at the end of the line and pause, and it
        moves on to the next.
      </p>
      <div className="row">
        <div className="field">
          <span>The page moves when you move</span>
          <div className="tabs small" role="group" aria-label="The page moves when you move">
            <button type="button" aria-pressed={!settings.FLIP} onClick={() => onChange({ FLIP: false })}>
              right
            </button>
            <button type="button" aria-pressed={settings.FLIP} onClick={() => onChange({ FLIP: true })}>
              left (flipped)
            </button>
          </div>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <span>A line ends at</span>
          <div className="tabs small" role="group" aria-label="A line ends at">
            <button type="button" aria-pressed={!view} onClick={() => onChange({ RESET_EDGE: 'page' })}>
              the page's end
            </button>
            <button type="button" aria-pressed={view} onClick={() => onChange({ RESET_EDGE: 'view' })}>
              the screen's edge
            </button>
          </div>
        </div>
        <button type="button" className="quiet" onClick={() => onChange({ ...CHASE_DEFAULTS })}>
          Reset to defaults
        </button>
      </div>
      <div className="controls">
        <label htmlFor="chase-rate" title="1 = the line keeps pace with your hand exactly; lower makes tighter, more overlapping loops">
          Rate
        </label>
        <input id="chase-rate" type="range" min="0.3" max="1.5" step="0.05" value={settings.RATE} onChange={num('RATE')} />
        <span>{settings.RATE.toFixed(2)}×</span>

        <label htmlFor="chase-connect" title="The page only moves while your pen heads flatter than this: connecting strokes move it, the steep strokes of a letter (up the side of an a or o) don't">
          Moves on strokes flatter than
        </label>
        <input id="chase-connect" type="range" min="10" max="90" step="1" value={settings.CONNECT_DEG} onChange={num('CONNECT_DEG')} />
        <span>{settings.CONNECT_DEG >= 90 ? 'any (no limit)' : `${settings.CONNECT_DEG}° from flat`}</span>

        <label htmlFor="chase-zone-phone">Chase zone, phone</label>
        <input id="chase-zone-phone" type="range" min="0" max="80" step="1" value={Math.round(settings.ZONE_PHONE * 100)} onChange={num('ZONE_PHONE', 100)} />
        <span>from {Math.round(settings.ZONE_PHONE * 100)}% across</span>

        <label htmlFor="chase-zone-desk">Chase zone, full screen</label>
        <input id="chase-zone-desk" type="range" min="20" max="95" step="1" value={Math.round(settings.ZONE_DESKTOP * 100)} onChange={num('ZONE_DESKTOP', 100)} />
        <span>from {Math.round(settings.ZONE_DESKTOP * 100)}% across</span>

        <label htmlFor="chase-line-phone" title="How tall one ruled line is on screen when you start">
          Line zoom, phone
        </label>
        <input id="chase-line-phone" type="range" min={settings.ZOOM_MIN} max={settings.ZOOM_MAX} step="5" value={settings.ZOOM_PHONE} onChange={num('ZOOM_PHONE')} />
        <span>{settings.ZOOM_PHONE} px a line</span>

        <label htmlFor="chase-line-desk">Line zoom, full screen</label>
        <input id="chase-line-desk" type="range" min={settings.ZOOM_MIN} max={settings.ZOOM_MAX} step="5" value={settings.ZOOM_DESKTOP} onChange={num('ZOOM_DESKTOP')} />
        <span>{settings.ZOOM_DESKTOP} px a line</span>

        <label htmlFor="chase-zoom-min" title="Pinching can't zoom out past this">
          Zoom, smallest
        </label>
        <input
          id="chase-zoom-min"
          type="range"
          min="40"
          max="300"
          step="5"
          value={settings.ZOOM_MIN}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ZOOM_MIN: v, ZOOM_MAX: Math.max(settings.ZOOM_MAX, v), ZOOM_PHONE: Math.max(settings.ZOOM_PHONE, v), ZOOM_DESKTOP: Math.max(settings.ZOOM_DESKTOP, v) });
          }}
        />
        <span>{settings.ZOOM_MIN} px a line</span>

        <label htmlFor="chase-zoom-max" title="Pinching can't zoom in past this">
          Zoom, biggest
        </label>
        <input
          id="chase-zoom-max"
          type="range"
          min="100"
          max="600"
          step="5"
          value={settings.ZOOM_MAX}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ZOOM_MAX: v, ZOOM_MIN: Math.min(settings.ZOOM_MIN, v), ZOOM_PHONE: Math.min(settings.ZOOM_PHONE, v), ZOOM_DESKTOP: Math.min(settings.ZOOM_DESKTOP, v) });
          }}
        />
        <span>{settings.ZOOM_MAX} px a line</span>

        {view ? (
          <>
            <label htmlFor="chase-view-edge">End of line</label>
            <input id="chase-view-edge" type="range" min="3" max="40" step="1" value={Math.round(settings.VIEW_EDGE * 100)} onChange={num('VIEW_EDGE', 100)} />
            <span>last {Math.round(settings.VIEW_EDGE * 100)}% of the screen</span>
          </>
        ) : (
          <>
            <label htmlFor="chase-end">End of line</label>
            <input id="chase-end" type="range" min="4" max="40" step="1" value={settings.END_MM} onChange={num('END_MM')} />
            <span>last {settings.END_MM} mm</span>
          </>
        )}

        <label htmlFor="chase-glow" title="How far before the end of the line it starts to redden">
          Reddens from
        </label>
        <input id="chase-glow" type="range" min="1" max="8" step="0.5" value={settings.GLOW_ZONES} onChange={num('GLOW_ZONES')} />
        <span>{settings.GLOW_ZONES}× that before it</span>

        <label htmlFor="chase-pause">Next line after</label>
        <input id="chase-pause" type="range" min="200" max="3000" step="100" value={settings.LINE_RESET_PAUSE} onChange={num('LINE_RESET_PAUSE')} />
        <span>{(settings.LINE_RESET_PAUSE / 1000).toFixed(1)} s still</span>

        <label htmlFor="chase-slant">Slant guides</label>
        <input id="chase-slant" type="range" min="40" max="90" step="1" value={settings.SLANT_DEG} onChange={num('SLANT_DEG')} disabled={!settings.SLANT_GUIDES} />
        <span>
          <label className="inline">
            <input type="checkbox" checked={settings.SLANT_GUIDES} onChange={(e) => onChange({ SLANT_GUIDES: e.target.checked })} /> {settings.SLANT_DEG}°
          </label>
        </span>
      </div>
      <div className="row">
        <label className="inline">
          <input type="checkbox" checked={settings.SHOW_ZONE} onChange={(e) => onChange({ SHOW_ZONE: e.target.checked })} /> show the chase zone while writing
        </label>
      </div>
      <p className="hint">A flex nib's own slant is used for its guides; the slant here is for the other nibs.</p>
    </div>
  );
}
