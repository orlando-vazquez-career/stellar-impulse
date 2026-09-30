import { useEffect, useRef, useState, type FormEvent } from "react";

const PLACEHOLDER = "[TU ALIAS]";
const MAX_ALIAS_LENGTH = 14;

interface AliasControlProps {
  alias: string;
  onSave: (value: string) => void;
}

export function AliasControl({ alias, onSave }: AliasControlProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias);
  const badge = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      return;
    }
    if (!returnFocus.current) return;
    returnFocus.current = false;
    badge.current?.focus();
  }, [editing]);

  function open() {
    setDraft(alias);
    setEditing(true);
  }

  function close() {
    returnFocus.current = true;
    setEditing(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    onSave(draft);
    close();
  }

  return (
    <>
      <button className="btn alias-badge" type="button" ref={badge} hidden={editing} aria-label="Cambiar alias" onClick={open}>
        <span className="alias-label">PILOTO</span>
        <span>{alias || PLACEHOLDER}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M9.5 1.5l3 3L4.5 12.5H1.5v-3z" /></svg>
      </button>
      <form className="alias-form" hidden={!editing} onSubmit={save}>
        <label className="alias-label" htmlFor="alias-input">ALIAS</label>
        <input id="alias-input" ref={input} className="alias-input" value={draft} maxLength={MAX_ALIAS_LENGTH} placeholder="TU NOMBRE" autoComplete="off" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") close(); }} />
        <button className="btn alias-submit" type="submit">LISTO</button>
      </form>
    </>
  );
}
