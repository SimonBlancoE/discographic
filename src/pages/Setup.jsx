import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

function Setup() {
  const { bootstrap } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const normalizedUsername = username.trim();

    if (normalizedUsername.length < 3) {
      const message = t('setup.usernameTooShort');
      setError(message);
      toast.error(message, t('setup.review'));
      return;
    }

    if (password.length < 8) {
      const message = t('setup.passwordTooShort');
      setError(message);
      toast.error(message, t('setup.review'));
      return;
    }

    if (password !== passwordConfirmation) {
      const message = t('setup.mismatch');
      setError(message);
      toast.error(message, t('setup.review'));
      return;
    }

    setSubmitting(true);
    try {
      await bootstrap(normalizedUsername, password);
    } catch (error) {
      const message = error.message || t('setup.error');
      setError(message);
      toast.error(message, t('setup.initial'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
      <form onSubmit={handleSubmit} className="glass-panel w-full space-y-5 p-8">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('setup.eyebrow')}</p>
            <select value={locale} onChange={(event) => setLocale(event.target.value)} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none">
              <option value="es" className="bg-slate-950">{t('language.es')}</option>
              <option value="en" className="bg-slate-950">{t('language.en')}</option>
            </select>
          </div>
          <h1 className="mt-3 font-display text-4xl text-white">{t('setup.title')}</h1>
          <p className="mt-2 text-sm text-slate-400">{t('setup.subtitle')}</p>
        </div>

        <label className="block space-y-2 text-sm text-slate-300">
          <span>{t('login.username')}</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
          <span className="text-xs text-slate-500">{t('setup.usernameHint')}</span>
        </label>

        <label className="block space-y-2 text-sm text-slate-300">
          <span>{t('login.password')}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
          <span className="text-xs text-slate-500">{t('setup.passwordHint')}</span>
        </label>

        <label className="block space-y-2 text-sm text-slate-300">
          <span>{t('setup.passwordConfirm')}</span>
          <input type="password" value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
        </label>

        {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <button type="submit" disabled={submitting} className="primary-button w-full disabled:opacity-60">
          {submitting ? t('setup.submitting') : t('setup.submit')}
        </button>
      </form>
    </div>
  );
}

export default Setup;
