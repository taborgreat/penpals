import { useSignature } from '../hand/signatures.js';
import { colorVars } from '../hand/colors.js';
import { HandDrawn } from './Hand.jsx';

// A scripter's name: their signature if they've signed one on their profile,
// otherwise @name. The whole signature always shows, `height` em tall and never
// wider than where it's put, in the colour they chose (deeper on hover), and
// it writes itself in like the site's handwritten labels.
export default function Username({ name, height = 1.7 }) {
  const signature = useSignature(name);
  if (!signature) return `@${name}`;
  return (
    <span className="username signed" style={colorVars(signature.color)}>
      <HandDrawn asset={signature} label={`@${name}`} fit={height} />
    </span>
  );
}
