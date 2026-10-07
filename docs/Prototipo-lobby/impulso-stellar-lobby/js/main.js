// Punto de entrada: arma las piezas y ajusta el escenario al tamaño de la ventana.

import { AliasBadge } from './alias.js';
import { Lobby } from './lobby.js';
import { SpaceSound } from './sound.js';
import { StarfieldCycler } from './starfield.js';

const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 900;

const stage = document.querySelector('[data-ref="stage"]');
const sound = new SpaceSound();

new Lobby({
  stage,
  sound,
  starfield: new StarfieldCycler(document.querySelector('[data-ref="sky"]')),
});

new AliasBadge({
  badge: document.querySelector('[data-ref="aliasBadge"]'),
  text: document.querySelector('[data-ref="aliasText"]'),
  form: document.querySelector('[data-ref="aliasForm"]'),
  input: document.querySelector('[data-ref="aliasInput"]'),
  onSave: () => sound.playSelect(),
});

bindSoundToggle(document.querySelector('[data-ref="soundToggle"]'));
fitStageToWindow();
window.addEventListener('resize', fitStageToWindow);

function bindSoundToggle(button) {
  const render = () => {
    button.classList.toggle('is-on', sound.enabled);
    button.setAttribute('aria-label', sound.enabled ? 'Silenciar efectos' : 'Activar efectos');
    button.querySelector('[data-icon="on"]').toggleAttribute('hidden', !sound.enabled);
    button.querySelector('[data-icon="off"]').toggleAttribute('hidden', sound.enabled);
  };
  button.addEventListener('click', () => {
    sound.toggle();
    render();
  });
  render();
}

function fitStageToWindow() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stage.style.transform = `scale(${scale})`;
}
