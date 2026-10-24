import { useSignature } from '../hand/signatures.js';

// A scripter's name: their signature (its settled look, in the ink they signed
// with) `height` em tall, otherwise @name while it loads or if they can't be shown.
export default function Username({ name, height = 1.7 }) {
  const signature = useSignature(name);
  if (!signature) return `@${name}`;
  const [, , w, h] = signature.box;
  return (
    <span className="username signed" title={`@${name}`}>
      <img className="signature-look" src={signature.look} alt={`@${name}`} style={{ height: `${height}em`, aspectRatio: `${w} / ${h}` }} draggable={false} />
    </span>
  );
}
