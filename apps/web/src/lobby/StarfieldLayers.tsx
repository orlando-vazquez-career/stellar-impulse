import { STARFIELD_IMAGES } from './starfield';

export function Starfield({ index }: { index: number }) {
  return (
    <div aria-hidden="true">
      {STARFIELD_IMAGES.map((image, layer) => (
        <div
          key={image}
          className={layer === index ? 'starfield is-visible' : 'starfield'}
          style={{ backgroundImage: `url("${image}")` }}
        />
      ))}
    </div>
  );
}
