// Estado y render del lobby. El estado es la única fuente de verdad:
// cada acción cambia el estado y luego se vuelve a pintar lo necesario.

import { MODES, findMode, planetSpritePath } from './modes.js';

const INITIAL_STATE = { modeId: MODES[0].id, entered: false, optionIndex: null, deployed: false };

export class Lobby {
  #refs;
  #sound;
  #starfield;
  #state = { ...INITIAL_STATE };
  #modeRows = new Map();
  #planetSprites = new Map();
  #optionRows = [];

  constructor({ stage, sound, starfield }) {
    this.#refs = collectRefs(stage);
    this.#sound = sound;
    this.#starfield = starfield;

    this.#buildModeRows();
    this.#buildMapNodes();
    this.#buildPlanetSprites();
    this.#bindControls();
    this.#render();
  }

  get #mode() {
    return findMode(this.#state.modeId);
  }

  // ---------- Acciones ----------

  #preview(modeId) {
    if (this.#state.entered || this.#state.modeId === modeId) return;
    this.#sound.playHover(findMode(modeId));
    this.#setState({ modeId });
  }

  #enter(modeId) {
    this.#sound.playEnter(findMode(modeId));
    this.#starfield.showRandomOther();
    this.#setState({ modeId, entered: true, optionIndex: null, deployed: false });
    this.#buildOptionRows();
    replayAnimation(this.#refs.shockwave, 'is-playing');
  }

  #back() {
    this.#starfield.showRandomOther();
    this.#setState({ entered: false, optionIndex: null, deployed: false });
  }

  #pickOption(optionIndex) {
    this.#sound.playSelect();
    this.#setState({ optionIndex, deployed: false });
  }

  #deploy() {
    if (this.#state.optionIndex === null) return;
    this.#setState({ deployed: true });
  }

  #setState(patch) {
    this.#state = { ...this.#state, ...patch };
    this.#render();
  }

  // ---------- Construcción del DOM (una sola vez) ----------

  #buildModeRows() {
    MODES.forEach((mode) => {
      const row = createRow({ ...mode, variant: 'mode' });
      row.style.setProperty('--row-accent', mode.accent);
      row.addEventListener('click', () => this.#enter(mode.id));
      row.addEventListener('mouseenter', () => this.#preview(mode.id));
      row.addEventListener('focus', () => this.#preview(mode.id));
      this.#refs.modeList.append(row);
      this.#modeRows.set(mode.id, row);
    });
  }

  #buildMapNodes() {
    MODES.forEach((mode) => {
      const node = createMapNode(mode);
      node.addEventListener('click', () => this.#enter(mode.id));
      node.addEventListener('mouseenter', () => this.#preview(mode.id));
      this.#refs.mapNodes.append(node);
    });
  }

  #buildPlanetSprites() {
    MODES.forEach((mode) => {
      const sprite = document.createElement('img');
      sprite.className = 'planet-sprite';
      sprite.src = planetSpritePath(mode);
      sprite.alt = '';
      sprite.width = 500;
      sprite.height = 500;
      this.#refs.planetSprites.append(sprite);
      this.#planetSprites.set(mode.id, sprite);
    });
  }

  #buildOptionRows() {
    this.#optionRows = this.#mode.options.map((option, index) => {
      const row = createRow({ num: formatIndex(index), name: option.name, meta: option.meta, variant: 'option' });
      row.addEventListener('click', () => this.#pickOption(index));
      return row;
    });
    this.#refs.optionList.replaceChildren(...this.#optionRows);
  }

  #bindControls() {
    this.#refs.backButton.addEventListener('click', () => this.#back());
    this.#refs.deployButton.addEventListener('click', () => this.#deploy());
  }

  // ---------- Render ----------

  #render() {
    const mode = this.#mode;
    const { entered } = this.#state;

    this.#refs.stage.style.setProperty('--accent', mode.accent);
    this.#refs.modesPanel.hidden = entered;
    this.#refs.lobbyMap.hidden = entered;
    this.#refs.detailPanel.hidden = !entered;
    this.#refs.planetStage.classList.toggle('is-zoomed', entered);

    this.#renderModeRows(mode);
    this.#renderPlanet(mode);
    this.#renderArt(mode);
    if (entered) this.#renderDetail(mode);
    this.#renderTicker(mode);
  }

  #renderModeRows(mode) {
    this.#modeRows.forEach((row, id) => row.classList.toggle('is-active', id === mode.id));
  }

  #renderPlanet(mode) {
    this.#planetSprites.forEach((sprite, id) => {
      const isCurrent = id === mode.id;
      sprite.classList.toggle('is-visible', isCurrent);
      sprite.alt = isCurrent ? `Planeta de ${mode.name}` : '';
    });
  }

  #renderArt(mode) {
    this.#refs.stage.querySelectorAll('[data-art]').forEach((art) => {
      art.toggleAttribute('hidden', !(this.#state.entered && art.dataset.art === mode.id));
    });
  }

  #renderDetail(mode) {
    const { optionIndex, deployed } = this.#state;
    this.#refs.detailCode.textContent = `MODO ${mode.num} · ${mode.code}`;
    this.#refs.detailName.textContent = mode.name;
    this.#refs.detailBlurb.textContent = mode.blurb;
    this.#optionRows.forEach((row, index) => row.classList.toggle('is-active', index === optionIndex));
    this.#refs.deployButton.disabled = optionIndex === null;
    this.#refs.deployButton.textContent = deployed ? 'EN RUTA' : 'DESPLEGAR';
  }

  #renderTicker(mode) {
    this.#refs.tickerStatus.textContent = tickerText(mode, this.#state);
    this.#refs.tickerHint.textContent = this.#state.entered ? 'T+00:00 · EN ÓRBITA' : 'PASA EL CURSOR · CLIC PARA ENTRAR';
  }
}

// ---------- Funciones puras y de apoyo ----------

function collectRefs(stage) {
  const refs = { stage };
  stage.querySelectorAll('[data-ref]').forEach((element) => {
    refs[element.dataset.ref] = element;
  });
  return refs;
}

function tickerText(mode, { entered, optionIndex, deployed }) {
  if (!entered) return `${mode.code} · ${mode.name.toUpperCase()}`;
  if (optionIndex === null) return 'ELIGE UNA OPCIÓN';
  const choice = mode.options[optionIndex].name.toUpperCase();
  return deployed ? `SALTANDO A ${choice}` : `LISTO · ${choice}`;
}

function formatIndex(index) {
  return String(index + 1).padStart(2, '0');
}

function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // fuerza reflow para reiniciar la animación
  element.classList.add(className);
}

function createElement(tag, className, text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function createRow({ num, name, code, meta, variant }) {
  const row = createElement('button', `btn row row--${variant}`);
  row.type = 'button';

  const head = createElement('span', 'row-head');
  const metaColumn = createElement('span', 'row-meta');
  if (code) metaColumn.append(createElement('span', 'row-code', code));
  metaColumn.append(createElement('span', '', meta));

  head.append(createElement('span', 'row-num', num), createElement('span', 'row-name serif', name), metaColumn);
  row.append(head, createElement('span', 'row-line'));
  return row;
}

function createMapNode(mode) {
  const node = createElement('button', 'btn map-node');
  node.type = 'button';
  node.setAttribute('aria-label', `Entrar a ${mode.name}`);
  node.style.left = `${mode.x - 7}px`;
  node.style.top = `${mode.y - 22}px`;
  node.style.setProperty('--node-accent', mode.accent);

  const dot = createElement('span', 'map-node-dot');
  dot.append(createElement('span', 'map-node-pulse'), createElement('span', 'map-node-core'));
  node.append(dot, createElement('span', 'map-node-code', mode.code), createElement('span', 'map-node-meta', mode.meta));
  return node;
}
