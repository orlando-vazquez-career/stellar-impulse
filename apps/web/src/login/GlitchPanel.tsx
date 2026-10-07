import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Holograma perdiendo señal: el panel vibra siempre un poco (CSS) y cada
 * pocos segundos sufre una ráfaga de glitch (clip-path, RGB split, saltos).
 * Las ráfagas se programan aquí; el maquillaje vive en login.css.
 * Con prefers-reduced-motion no hay ráfagas: el panel queda quieto.
 */
export interface GlitchPanelProps {
  children: ReactNode;
  /** Disparador de vibración: solo vibra/glitchea cuando el usuario falla la contraseña/login */
  trigger?: unknown;
}

/**
 * Holograma táctico: el panel permanece quieto y solo sufre una ráfaga de
 * vibración / glitch cuando el usuario falla su contraseña o autenticación.
 */
export function GlitchPanel({ children, trigger }: GlitchPanelProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trigger) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element = panel.current;
    if (!element) return;

    element.classList.remove('is-glitching');
    // Forzar reflow para reiniciar la animación si se activa consecutivamente
    void element.offsetWidth;
    element.classList.add('is-glitching');

    const releaseTimer = window.setTimeout(() => {
      element.classList.remove('is-glitching');
    }, 600);

    return () => {
      window.clearTimeout(releaseTimer);
      element.classList.remove('is-glitching');
    };
  }, [trigger]);

  return <div className="li-panel" ref={panel}>{children}</div>;
}
