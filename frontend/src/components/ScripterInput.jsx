import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

// Type a scripter's name. Suggests public scripters and your friends.
export default function ScripterInput({ id, value, onChange }) {
  const { user } = useAuth();
  const [names, setNames] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/api/users'), user ? api.get('/api/social').catch(() => ({ friends: [] })) : { friends: [] }])
      .then(([u, s]) => {
        const all = new Set([...s.friends, ...u.users.map((x) => x.username)]);
        all.delete(user?.username);
        setNames([...all].sort());
      })
      .catch(() => {});
  }, [user]);

  return (
    <>
      <input
        id={id}
        list={`${id}-names`}
        value={value}
        placeholder="@name"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value.replace(/^@/, '').trim())}
      />
      <datalist id={`${id}-names`}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
    </>
  );
}
