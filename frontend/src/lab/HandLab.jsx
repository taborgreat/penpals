import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { decodeActs } from 'penpals-law/v1/acts';
import { CALIBRATION_TEXT } from 'penpals-law/v1/hand';
import { b64url } from 'penpals-law/tags';
import LabPad from './LabPad.jsx';
import WriteMode from '../components/WriteMode.jsx';
import { guideRows } from '../ink/nibs.js';
import { createCapture, strokesToActs } from '../ink/capture.js';

// The hand lab (dev only): collects the writing for the Phase 0 experiment
// that decides whether the hand, read through the ink, can open a key.
// Samples go to law/lab/samples/ (gitignored) through the dev server; the
// analysis is `node law/lab/analyze.js`. Nothing here is part of the site.

const PEN = { nib: 0, size: 40, flex: 0, flow: 7, rgb: [20, 20, 20], angle: 0 }; // the calibration pen
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const BOXES = [...LETTERS].map((label, i) => ({ label, x: 16 + (i % 7) * 139, y: 16 + Math.floor(i / 7) * 152, w: 128, h: 142 }));
const PAGE_SESSIONS = [1, 5, 10];
const NAME = /^[a-z0-9][a-z0-9-]{0,19}$/;

const freshPhrase = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (v) => wordlist[v % 2048]).join(' ');
const guessDevice = () => (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 800 ? 'phone' : 'desktop');
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

async function save(sample) {
  const res = await fetch('/__lab/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error ?? 'save failed');
  return d.file;
}

// Strokes of a saved sample, back in page units (to trace over).
function strokesOf(actsB64) {
  const bytes = Uint8Array.from(atob(actsB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(actsB64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  const rec = decodeActs(bytes);
  return rec.strokes.map((s) => ({ points: [...s.x].map((x, i) => ({ x: rec.orgX + x / 10, y: rec.orgY + s.y[i] / 10 })) }));
}

export default function HandLab() {
  const [person, setPerson] = useState(() => store.get('penpals.lab.person') ?? '');
  const [device, setDevice] = useState(() => store.get('penpals.lab.device') ?? guessDevice());
  const [phrase, setPhrase] = useState('');
  const [list, setList] = useState([]);
  const [task, setTask] = useState(null); // { task, text, target?, arm?, background? }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [corpusLetters, setCorpusLetters] = useState(null);

  const refresh = useCallback(() => fetch('/__lab/list').then((r) => r.json()).then(setList).catch(() => setList([])), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    store.set('penpals.lab.person', person);
    setPhrase(store.get(`penpals.lab.phrase.${person}`) ?? list.find((s) => s.person === person && s.task === 'B')?.text ?? '');
  }, [person, list]);
  useEffect(() => store.set('penpals.lab.device', device), [device]);

  const mine = list.filter((s) => s.person === person);
  const session = useMemo(() => {
    const done = mine.filter((s) => s.device === device && s.task === 'B').map((s) => s.session);
    return done.length ? Math.max(...done) + 1 : 1;
  }, [mine, device]);
  const doneNow = (t) => mine.some((s) => s.device === device && s.session === session && s.task === t);
  const hasCorpus = mine.some((s) => s.task === 'corpus');
  const people = [...new Set(list.map((s) => s.person))].filter((p) => p !== person).sort();
  const phraseOf = (p) => list.find((s) => s.person === p && s.task === 'B')?.text;
  const traceable = list.filter((s) => s.person !== person && ['A', 'B', 'PAGE'].includes(s.task) && s.device !== 'phone');
  const valid = NAME.test(person);

  async function finish(strokes, extra = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const acts = strokesToActs(strokes, PEN);
      if (!acts) throw new Error('nothing written');
      const file = await save({ person, device, session: task.task === 'trace' || task.task === 'impostor' ? 1 : session, task: task.task, text: task.text, target: task.target, arm: task.arm, acts: b64url(acts), ...extra });
      setMsg(`Saved ${file}`);
      setTask(null);
      refresh();
    } catch (err) {
      setMsg(`Not saved: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function finishCorpus(pangramStrokes) {
    setBusy(true);
    try {
      const letters = {};
      for (const [ch, strokes] of Object.entries(corpusLetters)) {
        const acts = strokesToActs(strokes, PEN);
        if (acts) letters[ch] = b64url(acts);
      }
      const file = await save({ person, device: 'desktop', session: 0, task: 'corpus', letters, pangram: b64url(strokesToActs(pangramStrokes, PEN)) });
      setMsg(`Saved ${file} (${Object.keys(letters).length} letters)`);
      setTask(null);
      setCorpusLetters(null);
      refresh();
    } catch (err) {
      setMsg(`Not saved: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  // Letters: each stroke belongs to the box its first point is in; kept in the box's own frame.
  function takeLetters(strokes) {
    const out = {};
    for (const s of strokes) {
      const p = s.points[0];
      const b = BOXES.find((bx) => p.x >= bx.x && p.x < bx.x + bx.w && p.y >= bx.y && p.y < bx.y + bx.h);
      if (!b) continue;
      (out[b.label] ??= []).push({ ...s, points: s.points.map((q) => ({ ...q, x: q.x - b.x + 20, y: q.y - b.y + 20 })) });
    }
    const missing = [...LETTERS].filter((c) => !out[c]);
    if (missing.length) {
      setMsg(`Write every letter first (missing: ${missing.join(' ')})`);
      return;
    }
    setMsg(null);
    setCorpusLetters(out);
  }

  const start = (t) => {
    setMsg(null);
    setTask(t);
  };

  return (
    <div className="stack" style={{ maxWidth: 1040, margin: '0 auto' }}>
      <h1>Hand lab</h1>
      <p className="muted">
        Phase 0 of Living Ink: does a hand, read through the ink on the calibration paper, reliably open a key, and not for a tracer or
        a stitcher? Each person writes about ten sessions on a phone (thumb, write mode with the chase) and ten on a desktop (mouse or pen).
        Samples are saved to <code>law/lab/samples/</code> on this computer; nothing goes to the site.
      </p>

      <div className="row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label className="field">
          <span>Person</span>
          <input value={person} onChange={(e) => setPerson(e.target.value.toLowerCase().trim())} placeholder="e.g. tabor" />
        </label>
        <label className="field">
          <span>Device</span>
          <select value={device} onChange={(e) => setDevice(e.target.value)}>
            <option value="phone">phone (thumb, write mode)</option>
            <option value="desktop">desktop (mouse)</option>
            <option value="pen">desktop with a pen (pressure)</option>
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 260 }}>
          <span>{person || 'This person'}'s secret phrase (written every session, the same each time)</span>
          <input value={phrase} onChange={(e) => { setPhrase(e.target.value); store.set(`penpals.lab.phrase.${person}`, e.target.value); }} placeholder="a short phrase only they would write" />
        </label>
      </div>
      <p className="hint">In the real sign-in this phrase is never typed, shown or sent. The lab keeps its text only so the stitcher attack can be tested.</p>

      {!valid ? <p>Pick a person name (letters, numbers, dashes).</p> : (
        <>
          <h2>Session {session} on {device}</h2>
          <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={doneNow('A')} onClick={() => start({ task: 'A', text: freshPhrase() })}>{doneNow('A') ? '✓ ' : ''}A: a fresh phrase</button>
            <button type="button" disabled={doneNow('B') || phrase.trim().split(/\s+/).length < 2} onClick={() => start({ task: 'B', text: phrase.trim() })}>{doneNow('B') ? '✓ ' : ''}B: your phrase</button>
            {PAGE_SESSIONS.includes(session) && (
              <button type="button" disabled={doneNow('PAGE')} onClick={() => start({ task: 'PAGE', text: CALIBRATION_TEXT })}>{doneNow('PAGE') ? '✓ ' : ''}The calibration page</button>
            )}
          </div>
          <p className="hint">Do A and B in each session{PAGE_SESSIONS.includes(session) ? ', and the page' : ''}. B moves the session on, so do it last.</p>

          <h2>Once per person (on a desktop)</h2>
          <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={hasCorpus} onClick={() => start({ task: 'corpus' })}>{hasCorpus ? '✓ ' : ''}Public writing: the alphabet and a pangram</button>
          </div>
          <h2>Attacks (on a desktop)</h2>
          <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {people.filter((p) => phraseOf(p)).map((p) => (
              <button key={p} type="button" onClick={() => start({ task: 'impostor', target: p, text: phraseOf(p) })}>Write {p}'s phrase</button>
            ))}
          </div>
          {traceable.length > 0 && (
            <label className="field" style={{ marginTop: 8 }}>
              <span>Trace someone's sample</span>
              <select value="" onChange={async (e) => {
                const s = traceable.find((x) => x.file === e.target.value);
                if (!s) return;
                const full = await fetch(`/__lab/sample?file=${encodeURIComponent(s.file)}`).then((r) => r.json());
                start({ task: 'trace', target: s.person, arm: s.task, text: s.text, background: strokesOf(full.acts) });
              }}>
                <option value="">— pick a sample —</option>
                {traceable.map((s) => <option key={s.file} value={s.file}>{s.person} · {s.task} · {s.device} · session {s.session}</option>)}
              </select>
            </label>
          )}
        </>
      )}

      {msg && <p className={msg.startsWith('Not') ? 'error' : 'muted'} role="status">{msg}</p>}

      {task && task.task !== 'corpus' && (device !== 'phone' || task.task === 'trace' || task.task === 'impostor') && (
        <section>
          <h2>{taskTitle(task)}</h2>
          {task.text && <p style={{ fontSize: '1.4em' }}>{task.task === 'trace' ? 'Trace the grey writing as closely as you can.' : task.text}</p>}
          <LabPad
            key={`${task.task}-${task.text}-${task.target}`}
            width={1000}
            height={task.task === 'PAGE' || task.arm === 'PAGE' ? 700 : 300}
            baselines={task.task === 'PAGE' || task.arm === 'PAGE' ? [110, 200, 290, 380, 470, 560, 650] : [190]}
            background={task.background}
            busy={busy}
            onSave={(strokes) => finish(strokes)}
          />
          <button type="button" className="quiet" onClick={() => setTask(null)}>Cancel</button>
        </section>
      )}

      {task?.task === 'corpus' && (
        <section>
          {!corpusLetters ? (
            <>
              <h2>Each letter in its own box</h2>
              <p>Write a–z, one letter per box, sitting on the line, the way you normally write them.</p>
              <LabPad key="letters" width={1000} height={630} boxes={BOXES} onSave={takeLetters} saveLabel="Next: the pangram" />
            </>
          ) : (
            <>
              <h2>Now as ordinary writing</h2>
              <p style={{ fontSize: '1.3em' }}>the quick brown fox jumps over the lazy dog</p>
              <LabPad key="pangram" width={1000} height={300} baselines={[190]} busy={busy} onSave={finishCorpus} />
            </>
          )}
          <button type="button" className="quiet" onClick={() => { setTask(null); setCorpusLetters(null); }}>Cancel</button>
        </section>
      )}

      {task && ['A', 'B', 'PAGE'].includes(task.task) && device === 'phone' && (
        <PhoneTask task={task} busy={busy} onSave={(strokes) => finish(strokes)} onCancel={() => setTask(null)} />
      )}

      <h2>Collected</h2>
      <Summary list={list} />
    </div>
  );
}

const taskTitle = (t) => ({
  A: 'A: write this fresh phrase',
  B: 'B: write your phrase',
  PAGE: 'The calibration page',
  impostor: `Write ${t.target}'s phrase, in your own hand`,
  trace: `Trace ${t.target}'s ${t.arm} sample`,
}[t.task]);

// On a phone: the real write mode with the chase, recording acts through capture.js.
function PhoneTask({ task, onSave, onCancel }) {
  const capRef = useRef(createCapture());
  const draftRef = useRef({ strokes: [] });
  const pageW = 1400;
  const height = task.task === 'PAGE' ? 1811 : 905;
  const spacing = 91;
  const rows = useMemo(() => guideRows('plain', spacing, height), [height]);
  return (
    <>
      <WriteMode
        getStrokes={() => []}
        draftRef={draftRef}
        nib={() => ({ nib: 'pen', size: 5 })}
        pageW={pageW}
        height={height}
        rows={rows}
        spacing={spacing}
        guide="plain"
        slant={55}
        paper="plain"
        inkColor="#1d2a44"
        capture={capRef.current}
        onLeave={onCancel}
        onPlay={() => {
          onSave(capRef.current.strokes);
          return null;
        }}
        onDone={onCancel}
      />
      {createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001, pointerEvents: 'none', padding: '6px 10px', background: 'rgba(251,248,241,0.92)', fontSize: 18, textAlign: 'center' }}>
          {task.text} <span style={{ opacity: 0.6 }}>(▶ Play saves)</span>
        </div>,
        document.body,
      )}
    </>
  );
}

function Summary({ list }) {
  const people = [...new Set(list.map((s) => s.person))].sort();
  if (!people.length) return <p className="muted">Nothing yet.</p>;
  return (
    <table>
      <thead><tr><th>person</th><th>phone A/B/page</th><th>desktop A/B/page</th><th>corpus</th><th>attacks made</th></tr></thead>
      <tbody>
        {people.map((p) => {
          const n = (d, t) => list.filter((s) => s.person === p && (d === 'desktop' ? s.device !== 'phone' : s.device === d) && s.task === t).length;
          return (
            <tr key={p}>
              <td>{p}</td>
              <td>{n('phone', 'A')}/{n('phone', 'B')}/{n('phone', 'PAGE')}</td>
              <td>{n('desktop', 'A')}/{n('desktop', 'B')}/{n('desktop', 'PAGE')}</td>
              <td>{list.some((s) => s.person === p && s.task === 'corpus') ? '✓' : ''}</td>
              <td>{list.filter((s) => s.person === p && (s.task === 'impostor' || s.task === 'trace')).length}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
