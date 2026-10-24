import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import Hand from './Hand.jsx';
import SignIn from './SignIn.jsx';
import Register from './Register.jsx';

// Log in or make an account: both by hand (keys.md, design B).
export default function AuthPanel() {
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
      {mode === 'login' ? <SignIn onDone={signedIn} /> : <Register onDone={signedIn} />}
    </div>
  );
}
