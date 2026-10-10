import { useEffect, useReducer, useRef, useState } from 'react';
import { GlitchPanel } from './GlitchPanel';
import { LoginForm } from './LoginForm';
import { initialLoginUi, reduceLoginUi } from './login-state';
import { createLoginScene } from './scene';
import { Brand } from '../visual/shared/Brand';
import { LanguageToggle } from '../visual/shared/LanguageToggle';
import { useI18n } from '../visual/i18n';
import loginCss from './login.css?inline';

export interface LoginScreenProps {
  alias: string;
  onAliasChange?: (alias: string) => void;
  onContinueGuest?: (alias: string) => void;
  onLogin?: (email: string, password: string) => Promise<void>;
  /** Si existe, el panel ofrece "Crear cuenta" junto a "Iniciar sesión". */
  onRegister?: (email: string, password: string, alias: string) => Promise<void>;
  busy?: boolean;
  notice?: string;
  onCreateTraining?: (alias: string) => void;
  onJoinRoom?: (code: string, alias: string) => void;
  chainStatus?: string;
  chainBusy?: boolean;
  /** Si existe, muestra el acceso al centro de mando debajo del panel. */
  onOpenAtlas?: () => void;
  musicVolume?: number;
  musicMuted?: boolean;
  onMusicVolumeChange?: (volume: number) => void;
  onMusicMuteChange?: (muted: boolean) => void;
}

/**
 * Puerta de entrada principal del juego: la nave ardiendo en primer plano,
 * asteroides detrás, y el panel-holograma cyberpunk del login a la derecha.
 * Ocupa el viewport completo e inicia toda la experiencia de Stellar Impulse.
 */
export function LoginScreen(props: LoginScreenProps) {
  const {
    alias,
    onAliasChange,
    onContinueGuest,
    onLogin,
    onRegister,
    busy = false,
    notice = '',
    onCreateTraining = () => {},
    onJoinRoom = () => {},
    chainStatus = 'Stellar Testnet',
    chainBusy = false,
    onOpenAtlas,
    musicVolume = 60,
    musicMuted = false,
    onMusicVolumeChange = () => {},
    onMusicMuteChange = () => {},
  } = props;
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ui, dispatch] = useReducer(reduceLoginUi, undefined, initialLoginUi);
  const [glitchTrigger, setGlitchTrigger] = useState(0);
  const [musicOptionsOpen, setMusicOptionsOpen] = useState(false);

  const triggerGlitch = () => setGlitchTrigger((count) => count + 1);

  // Si notice cambia a un mensaje de error (fallo de contraseña o red), hacer vibrar el panel
  const prevNoticeRef = useRef(notice);
  useEffect(() => {
    if (notice && notice !== prevNoticeRef.current) {
      triggerGlitch();
    }
    prevNoticeRef.current = notice;
  }, [notice]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const scene = createLoginScene(element);
    scene.start();

    const onResize = () => scene.resize();
    const onPointer = (event: PointerEvent) => {
      scene.setPointer(
        (event.clientX / window.innerWidth) * 2 - 1,
        (event.clientY / window.innerHeight) * 2 - 1,
      );
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointer);
    return () => {
      scene.stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, []);

  // Cuando la conexión del padre termina (éxito o error), liberar los botones.
  useEffect(() => {
    if (!busy) dispatch({ type: 'settle' });
  }, [busy, notice]);

  useEffect(() => {
    if (!chainBusy) dispatch({ type: 'settle' });
  }, [chainBusy]);

  return (
    <div className="li-viewport">
      <style>{loginCss}</style>
      <canvas ref={canvas} className="li-canvas" aria-hidden="true" />
      <header className="li-topbar">
        <Brand />
        <div className="li-topbar__actions">
          <LanguageToggle />
          <div className="li-music-control">
            <button className="li-music-control__toggle" type="button" aria-label={t('musicSettings')} aria-expanded={musicOptionsOpen} onClick={() => setMusicOptionsOpen(!musicOptionsOpen)}>
              <span aria-hidden="true">♫</span><span>{t('musicSettings')}</span>
            </button>
            {musicOptionsOpen && <section className="li-music-control__panel" aria-label={t('musicSettings')}>
              <label className="li-music-control__range"><span><strong>{t('musicVolume')}</strong><output>{musicVolume}%</output></span>
                <input type="range" min="0" max="100" value={musicVolume} aria-label={t('loginMusicVolume')} onChange={(event) => onMusicVolumeChange(Number(event.target.value))} />
              </label>
              <label className="li-music-control__mute"><input type="checkbox" checked={musicMuted} aria-label={t('muteMusic')} onChange={(event) => onMusicMuteChange(event.target.checked)} /><span>{t('muteMusic')}</span></label>
            </section>}
          </div>
        </div>
      </header>
      <div className="li-panel-wrap">
        <GlitchPanel trigger={glitchTrigger}>
          <LoginForm
            alias={alias}
            onAliasChange={onAliasChange}
            onContinueGuest={onContinueGuest}
            onLogin={onLogin}
            onRegister={onRegister}
            onLoginError={triggerGlitch}
            busy={busy}
            notice={notice}
            ui={ui}
            dispatch={dispatch}
            onCreateTraining={onCreateTraining}
            onJoinRoom={onJoinRoom}
            chainStatus={chainStatus}
            chainBusy={chainBusy}
            onOpenAtlas={onOpenAtlas}
          />
        </GlitchPanel>
      </div>
    </div>
  );
}
