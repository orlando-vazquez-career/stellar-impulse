import { useEffect, useState } from 'react';
import { getMusicPlayer } from '../music';

export function AudioToggle() {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const player = getMusicPlayer();
    setPlaying(player.isPlaying);
    setMuted(player.isMuted);

    const interval = setInterval(() => {
      setPlaying(player.isPlaying);
      setMuted(player.isMuted);
    }, 350);

    return () => clearInterval(interval);
  }, []);

  function handleClick() {
    const player = getMusicPlayer();
    if (!player.isPlaying) {
      player.resume();
      player.play('menu');
      setPlaying(true);
    } else {
      const nextMuted = player.toggleMute();
      setMuted(nextMuted);
    }
  }

  return (
    <button
      type="button"
      className={`vi-audio-toggle ${!playing ? 'is-waiting' : ''} ${muted ? 'is-muted' : ''}`}
      onClick={handleClick}
      title={playing ? (muted ? 'Activar sonido' : 'Silenciar música') : 'Iniciar música'}
    >
      <span className="vi-audio-toggle__icon" aria-hidden="true">
        {muted ? '🔇' : playing ? '🔊' : '🔈'}
      </span>
      <span className="vi-audio-toggle__label">
        {!playing ? 'ACTIVAR MÚSICA' : muted ? 'SILENCIADO' : 'MÚSICA'}
      </span>
    </button>
  );
}
