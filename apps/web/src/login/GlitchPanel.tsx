import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Holograma perdiendo señal: el panel vibra siempre un poco (CSS) y cada
 * pocos segundos sufre una ráfaga de glitch (clip-path, RGB split, saltos).
 * Las ráfagas se programan aquí; el maquillaje vive en login.css.
 * Con prefers-reduced-motion no hay ráfagas: el panel queda quieto.
 */
export function GlitchPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let burstTimer = 0;
    let releaseTimer = 0;
    const schedule = (delay: number) => {
      burstTimer = window.setTimeout(() => {
        const element = panel.current;
        if (!element) return;
        element.classList.add('is-glitching');
        releaseTimer = window.setTimeout(() => {
          element.classList.remove('is-glitching');
          schedule(5000);
        }, 600);
      }, delay);
    };
    schedule(2500);
    return () => {
      window.clearTimeout(burstTimer);
      window.clearTimeout(releaseTimer);
    };
  }, []);

  return <div className="li-panel" ref={panel}>{children}</div>;
}
