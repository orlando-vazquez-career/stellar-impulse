// Alias del piloto: solo visual, se guarda en localStorage para recordarlo.

const STORAGE_KEY = 'impulso-stellar:alias';
const PLACEHOLDER = '[TU ALIAS]';

export class AliasBadge {
  #badge;
  #text;
  #form;
  #input;
  #onSave;

  constructor({ badge, text, form, input, onSave = () => {} }) {
    this.#badge = badge;
    this.#text = text;
    this.#form = form;
    this.#input = input;
    this.#onSave = onSave;

    this.#render(readStoredAlias());
    this.#bindEvents();
  }

  #bindEvents() {
    this.#badge.addEventListener('click', () => this.#openEditor());
    this.#form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#save();
    });
    this.#input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.#closeEditor();
    });
  }

  #openEditor() {
    this.#input.value = readStoredAlias();
    this.#toggleEditor(true);
    this.#input.focus();
  }

  #closeEditor() {
    this.#toggleEditor(false);
    this.#badge.focus();
  }

  #save() {
    const alias = this.#input.value.trim().toUpperCase();
    storeAlias(alias);
    this.#render(alias);
    this.#closeEditor();
    this.#onSave(alias);
  }

  #toggleEditor(isEditing) {
    this.#badge.hidden = isEditing;
    this.#form.hidden = !isEditing;
  }

  #render(alias) {
    this.#text.textContent = alias || PLACEHOLDER;
  }
}

function readStoredAlias() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeAlias(alias) {
  try {
    localStorage.setItem(STORAGE_KEY, alias);
  } catch {
    // Sin almacenamiento disponible: el alias vive solo en esta sesión.
  }
}
