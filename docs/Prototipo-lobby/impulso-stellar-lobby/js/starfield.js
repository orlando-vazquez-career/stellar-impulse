// Capas de estrellas apiladas: solo una visible; el cambio es un fundido por CSS.

const STARFIELD_IMAGES = [
  'assets/starfields/starfield-1.png',
  'assets/starfields/starfield-2.png',
  'assets/starfields/starfield-3.png',
  'assets/starfields/starfield-4.png',
];

export class StarfieldCycler {
  #layers;
  #visibleIndex = 0;

  constructor(container) {
    this.#layers = STARFIELD_IMAGES.map((image) => createLayer(container, image));
    this.#show(0);
  }

  showRandomOther() {
    const offset = 1 + Math.floor(Math.random() * (this.#layers.length - 1));
    this.#show((this.#visibleIndex + offset) % this.#layers.length);
  }

  #show(index) {
    this.#visibleIndex = index;
    this.#layers.forEach((layer, i) => layer.classList.toggle('is-visible', i === index));
  }
}

function createLayer(container, image) {
  const layer = document.createElement('div');
  layer.className = 'starfield';
  layer.style.backgroundImage = `url("${image}")`;
  container.append(layer);
  return layer;
}
