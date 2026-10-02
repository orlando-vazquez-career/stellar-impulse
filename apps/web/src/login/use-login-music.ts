import { useEffect } from 'react';

/**
 * Punto de montaje de la música del login. La pista la aporta el equipo:
 * basta soltar el archivo en `public/audio/login-theme.mp3`. Navegadores
 * exigen un gesto del usuario antes de reproducir, así que arranca con el
 * primer clic o tecla; si el archivo no existe, falla en silencio.
 */
export function useLoginMusic(src = 'audio/login-theme.mp3', volume = 0.35): void {
  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    let missing = false;
    const onError = () => { missing = true; };
    audio.addEventListener('error', onError);

    const unlock = () => {
      if (!missing) void audio.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      audio.pause();
      audio.removeEventListener('error', onError);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [src, volume]);
}
