import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';

export function AccessScreen({ onContinue }: { onContinue(alias: string): void }) {
  const { t } = useI18n();
  const [alias, setAlias] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = alias.trim();
    if (normalized) onContinue(normalized);
  };
  return <main className="vi-access vi-screen">
    <header className="vi-screen__header"><Brand /><LanguageToggle /></header>
    <section className="vi-access__content">
      <div className="vi-access__copy">
        <p className="vi-eyebrow">{t('accessEyebrow')}</p>
        <h1>{t('accessTitle')}</h1>
        <p>{t('accessBody')}</p>
      </div>
      <form className="vi-access-card" onSubmit={submit}>
        <div className="vi-access-card__status"><span aria-hidden="true" />{t('prototype')}</div>
        <label htmlFor="commander-alias">{t('callsign')}</label>
        <input id="commander-alias" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder={t('callsignPlaceholder')} maxLength={24} autoComplete="off" autoFocus />
        <button className="vi-primary" disabled={!alias.trim()}>{t('continueGuest')}<span aria-hidden="true">→</span></button>
        <p className="vi-fineprint">{t('privacyNote')}</p>
      </form>
    </section>
    <footer className="vi-screen__footer"><span>IMPULSO // UI FOUNDATION</span><span>v0.4 · TESTNET</span></footer>
  </main>;
}
