import { useState } from 'react';
import { api } from '../api.js';
import { timeAgo } from '../format.js';
import ScripterInput from './ScripterInput.jsx';

// Send one of my letters to one scripter. Once sent, shows its status instead.
export default function SendControl({ letter, defaultTo = '', onSent }) {
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (letter.sentAt) {
    return (
      <p className="muted">
        sent to @{letter.to} {timeAgo(letter.sentAt)} · {letter.openedAt ? `opened ${timeAgo(letter.openedAt)}` : 'sealed'}
      </p>
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const d = await api.post(`/api/letters/${letter.id}/send`, { to });
      onSent?.(d.letter);
    } catch (err) {
      const when = err.data?.retryAt ? ` Try again after ${new Date(err.data.retryAt).toLocaleTimeString()}.` : '';
      setError(err.message + when);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row">
      <label>
        Send to <ScripterInput id={`send-${letter.id}`} value={to} onChange={setTo} />
      </label>
      <button type="button" disabled={!to || busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
