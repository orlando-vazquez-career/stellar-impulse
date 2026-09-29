import { useI18n } from '../i18n';
import { Brand } from '../shared/Brand';
import { LanguageToggle } from '../shared/LanguageToggle';

function MenuCard({ title, detail, glyph, enabled = false, onClick }: { title: string; detail: string; glyph: string; enabled?: boolean; onClick?(): void }) {
  const { t } = useI18n();
  return <button className="vi-menu-card" disabled={!enabled} onClick={onClick}>
    <span className="vi-menu-card__glyph" aria-hidden="true">{glyph}</span>
    <span className="vi-menu-card__copy"><strong>{title}</strong><small>{detail}</small></span>
    {enabled ? <span className="vi-menu-card__arrow" aria-hidden="true">→</span> : <span className="vi-menu-card__tag">{t('inDevelopment')}</span>}
  </button>;
}

export function CommandCenter({ alias, onCreateRoom, onJoinRoom, onHangar, onSettings, onSignOut }: { alias: string; onCreateRoom(): void; onJoinRoom(): void; onHangar(): void; onSettings(): void; onSignOut(): void }) {
  const { t } = useI18n();
  return <main className="vi-command vi-screen">
    <header className="vi-screen__header"><Brand /><div className="vi-header-actions"><LanguageToggle /><button className="vi-text-button" onClick={onSignOut}>{t('signOut')}</button></div></header>
    <section className="vi-command__content">
      <div className="vi-command__heading">
        <p className="vi-eyebrow">{t('commandCenter')}</p>
        <h1>{t('welcome', { name: alias })}</h1>
        <p>{t('menuBody')}</p>
      </div>
      <div className="vi-menu-grid">
        <MenuCard glyph="△" title={t('deploy')} detail={t('deployDetail')} enabled onClick={onCreateRoom} />
        <MenuCard glyph="⌁" title={t('joinRoom')} detail={t('joinDetail')} enabled onClick={onJoinRoom} />
        <MenuCard glyph="◇" title={t('hangar')} detail={t('hangarDetail')} enabled onClick={onHangar} />
        <MenuCard glyph="＋" title={t('settings')} detail={t('settingsDetail')} enabled onClick={onSettings} />
      </div>
    </section>
    <div className="vi-command__sector" aria-hidden="true"><span>01</span><i /><small>{t('sector')} // {t('preparation')}</small></div>
    <footer className="vi-screen__footer"><span>{t('commander')} // {alias.toUpperCase()}</span><span>{t('localConnection')}</span></footer>
  </main>;
}
