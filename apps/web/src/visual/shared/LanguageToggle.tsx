import { useI18n } from '../i18n';

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return <div className="vi-language" role="group" aria-label={t('language')}>
    <button className={locale === 'es' ? 'is-active' : ''} onClick={() => setLocale('es')} aria-pressed={locale === 'es'}>{t('spanish')}</button>
    <button className={locale === 'en' ? 'is-active' : ''} onClick={() => setLocale('en')} aria-pressed={locale === 'en'}>{t('english')}</button>
  </div>;
}
