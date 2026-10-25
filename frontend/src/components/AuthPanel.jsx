import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Hand from './Hand.jsx';
import SignIn from './SignIn.jsx';
import Register from './Register.jsx';

// Log in or make an account (accounts-change.md: signatures make the key; sign
// in by name and a password, the 24 words or the private key). onDone(user):
// what happens once you are in (the lobby closes the eye first: rooms.md §1a).
// Registering is signing on the paper on the lobby's table (onSheet: Register's
// sheet, for the lobby's scene); anywhere else it is at the front door.
export default function AuthPanel({ onDone = null, onSheet = null }) {
  const { signedIn } = useAuth();
  const [mode, setMode] = useState('login');

  // The tabs change colour when chosen; tell their handwriting to follow.
  useEffect(() => {
    window.dispatchEvent(new Event('penpals:recolor'));
  }, [mode]);

  return (
    <div className="stack">
      <div className="tabs auth-modes" role="group" aria-label="Log in or register">
        <button type="button" className="mode-login" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>
          <Hand>log in</Hand>
        </button>
        <button type="button" className="mode-register" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>
          <Hand>register</Hand>
        </button>
      </div>
      {mode === 'login' ? (
        <SignIn onDone={onDone ?? signedIn} />
      ) : onSheet ? (
        <Register onDone={onDone ?? signedIn} onSheet={onSheet} />
      ) : (
        <p>
          You make an account at the front door, signing your name on the paper there. <Link to="/">To the front door</Link>
        </p>
      )}
    </div>
  );
}
