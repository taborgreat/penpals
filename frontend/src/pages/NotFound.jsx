import { Link } from 'react-router-dom';
import Hand from '../components/Hand.jsx';

// Any address that isn't a page.
export default function NotFound() {
  return (
    <div className="not-found">
      <h1><Hand>Nothing here.</Hand></h1>
      <p><Link to="/"><Hand>Take me home</Hand></Link></p>
    </div>
  );
}
