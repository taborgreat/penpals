import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keys as K, fromB64url } from 'penpals-law';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import KeyGate from '../components/KeyGate.jsx';
import Pad from '../components/Pad.jsx';
import ScripterInput from '../components/ScripterInput.jsx';
import Username from '../components/Username.jsx';
import Hand from '../components/Hand.jsx';
import { newSheet, sealInk, openBy } from '../keys/session.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import { verifyProofHere } from '../ink/grown.js';
import { download } from '../ink/export.js';

const PROOF_PAD = { width: 1000, height: 300 };
const FAMILY = Object.freeze({ grain: 8, weight: 8, tooth: 0 });

// Live proofs (keys.md): ask someone to show, now, that they hold their key.
// Your ask is a fresh challenge; with their key it names a sheet and a phrase
// nobody could know before you asked. They write the phrase on that sheet,
// seal it and open it; you get a file anyone can check offline
// (node law/bin/verify.js proof.json), and you can check it here.
export default function Proofs() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const [to, setTo] = useState(params.get('to') ?? '');
  const [pending, setPending] = useState([]);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.get('/api/proofs/pending'), api.get('/api/proofs/mine')]);
      setPending(p.proofs);
      setMine(m.proofs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function askFor(name) {
    setError(null);
    try {
      await api.post('/api/proofs', { to: name });
      setTo('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return null;
  if (!user) return <p>Log in to ask for or answer a live proof.</p>;
  return (
    <div className="stack narrow proofs">
      <h1>
        <Hand>Live proofs</Hand>
      </h1>
      <p className="muted">Ask someone to prove, by hand and right now, that they hold the key their book is sealed with.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (to) askFor(to);
        }}
      >
        <ScripterInput id="proof-to" value={to} onChange={setTo} />
        <button className="primary" disabled={!to}>
          Ask
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      {pending.length > 0 && (
        <h2>
          <Hand>Asked of you</Hand>
        </h2>
      )}
      {pending.map((p) => (
        <KeyGate key={p.id}>{(writer) => <Answer proof={p} writer={writer} onDone={load} />}</KeyGate>
      ))}

      <h2>
        <Hand>You asked</Hand>
      </h2>
      {!mine.length && <p className="muted">Nothing yet.</p>}
      {mine.map((p) => (
        <Asked key={p.id} proof={p} />
      ))}
    </div>
  );
}

// Write the phrase your key and their challenge name, on the sheet they name.
function Answer({ proof, writer, onDone }) {
  const { sheet, phrase } = useMemo(() => K.proofOf(fromB64url(proof.challenge, 32), writer.pk), [proof.challenge, writer]);
  const paper = useMemo(() => newSheet(writer, sheet), [writer, sheet]);
  const ink = useLiveInk({ paperKey: paper.paperKey, family: FAMILY, size: PROOF_PAD }, sheet);
  const [strokes, setStrokes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const settled = await ink.settle();
      const { line, D } = sealInk(writer, { sheet, seed: paper.seed, use: 'proof', family: FAMILY, settled, proof: { challenge: proof.challenge, phrase } });
      await api.post(`/api/proofs/${proof.id}/answer`, { line: { ...line, open: openBy(writer, D, sheet, paper.seed) } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack card">
      <p>
        <Username name={proof.from} /> asks for a live proof. Write, in your own hand:
      </p>
      <p className="proof-phrase">
        <strong>{phrase}</strong>
      </p>
      {ink && <Pad ink={ink} size={PROOF_PAD} onChange={setStrokes} hint="Write the four words on a line." />}
      <div className="row">
        <button type="button" className="primary" disabled={!strokes || busy} onClick={send}>
          {busy ? 'Sealing…' : 'Seal and answer'}
        </button>
        <span className="meta">until {new Date(proof.expiresAt).toLocaleString()}</span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Asked({ proof }) {
  const [bundle, setBundle] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!proof.answeredAt) return;
    api
      .get(`/api/proofs/${proof.id}`)
      .then(setBundle)
      .catch((err) => setError(err.message));
  }, [proof.id, proof.answeredAt]);

  async function check() {
    setReport('checking');
    try {
      setReport(await verifyProofHere(bundle));
    } catch (err) {
      setReport(null);
      setError(err.message);
    }
  }

  return (
    <div className="stack card">
      <p>
        <Username name={proof.to} /> · asked {new Date(proof.createdAt).toLocaleString()} ·{' '}
        {proof.answeredAt ? `answered ${new Date(proof.answeredAt).toLocaleString()}` : Date.parse(proof.expiresAt) > Date.now() ? 'waiting' : 'expired'}
      </p>
      {bundle?.line && (
        <>
          <p className="proof-phrase">
            The phrase: <strong>{bundle.line.ink.proof.phrase}</strong>
          </p>
          <img className="proof-look" src={`/api/proofs/${proof.id}/look`} loading="lazy" alt={`${proof.to} writing the phrase`} />
          <div className="row">
            <button type="button" onClick={check} disabled={report === 'checking'}>
              {report === 'checking' ? 'Checking…' : 'Check it here'}
            </button>
            <button type="button" className="quiet" onClick={() => download(new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' }), `proof-${proof.to}-${proof.id}.json`)}>
              Download the proof
            </button>
          </div>
          {report &&
            report !== 'checking' &&
            (report.ok ? (
              <p>
                <strong>It checks:</strong> sealed by their key, on the sheet your ask names, and grown again here exactly as sealed. Does it say the phrase? That part is for your eyes.
              </p>
            ) : (
              <p className="error">It does not check: {report.problems.join('; ')}</p>
            ))}
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
