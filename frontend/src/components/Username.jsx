import { useSignature } from '../hand/signatures.js';

// A scripter's name: their signature (its settled look, in the ink they signed
// with) `height` em tall, otherwise @name while it loads or if they can't be shown.
// A long flat signature is shown smaller rather than wider than MAX_WIDE em.
const MAX_WIDE = 16;
export default function Username({ name, height = 1.7 }) {
  const signature = useSignature(name);
  if (!signature) return `@${name}`;
  const [, , w, h] = signature.box;
  const em = Math.min(height, (MAX_WIDE * h) / Math.max(1, w));
  return (
    <span className="username signed" title={`@${name}`}>
      <img className="signature-look" src={signature.look} loading="lazy" alt={`@${name}`} style={{ height: `${em}em`, aspectRatio: `${w} / ${h}` }} draggable={false} />
    </span>
  );
}
