import { useAuth } from '../auth.jsx';
import { useKey } from '../keys/session.js';
import SignIn from './SignIn.jsx';

// Writing needs the account key in this tab. Signed in without it (a new tab),
// the writer unlocks first; then `children(key)` renders.
export default function KeyGate({ children, signedOut = null }) {
  const { user, signedIn } = useAuth();
  const key = useKey(user);
  if (!user) return signedOut;
  if (!key) return <SignIn unlock presetName={user.username} onDone={signedIn} />;
  return children(key);
}
