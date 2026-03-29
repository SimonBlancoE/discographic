import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { useI18n } from '../lib/I18nContext';
import { formatDate } from '../lib/format';
import { useToast } from '../lib/ToastContext';

function AdminPanel() {
  const toast = useToast();
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [adminError, setAdminError] = useState('');
  const { user: currentUser } = useAuth();

  async function loadUsers() {
    try {
      const result = await api.listUsers();
      setUsers(result.users || []);
    } catch (error) {
      setAdminError(error.message);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setAdminError('');
    try {
      await api.createUser({ username: newUsername, password: newPassword });
      setNewUsername('');
      setNewPassword('');
      toast.success(t('settings.userCreated'));
      await loadUsers();
    } catch (error) {
      setAdminError(error.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(userId, username) {
    if (!window.confirm(t('settings.deleteConfirm', { username }))) {
      return;
    }

    setAdminError('');
    try {
      await api.deleteUser(userId);
      toast.success(t('settings.userDeleted', { username }));
      await loadUsers();
    } catch (error) {
      setAdminError(error.message);
    }
  }

  return (
    <section className="glass-panel space-y-5 p-6">
      <div>
        <h3 className="font-display text-2xl text-white">{t('settings.adminTitle')}</h3>
        <p className="mt-1 text-sm text-slate-400">{t('settings.adminSubtitle')}</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/5">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="px-4 py-3">{t('login.username')}</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Creado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/5 text-slate-200">
                <td className="px-4 py-3 font-medium">{user.username}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${user.role === 'admin' ? 'bg-brand-500/20 text-brand-200' : 'bg-white/5 text-slate-400'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{formatDate(user.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {user.id !== currentUser?.id ? (
                     <button
                       type="button"
                      onClick={() => handleDelete(user.id, user.username)}
                       className="text-sm text-rose-300 transition hover:text-rose-100"
                     >
                        {t('settings.delete')}
                     </button>
                   ) : (
                     <span className="text-sm text-slate-500">{t('settings.you')}</span>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm text-slate-300">
          <span>{t('settings.newUser')}</span>
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="nombre" className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
        </label>
        <label className="flex-1 space-y-1 text-sm text-slate-300">
          <span>{t('login.password')}</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t('settings.passwordMin')} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
        </label>
        <button type="submit" disabled={creating} className="primary-button disabled:opacity-60">
          {creating ? t('settings.creatingUser') : t('settings.createUser')}
        </button>
      </form>
      {adminError && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{adminError}</div>}
    </section>
  );
}

function Settings() {
  const toast = useToast();
  const { t } = useI18n();
  const { logout, refreshAccount, isAdmin } = useAuth();
  const [discogsUsername, setDiscogsUsername] = useState('');
  const [newToken, setNewToken] = useState('');
  const [tokenPreview, setTokenPreview] = useState(null);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAccount().then((account) => {
      setDiscogsUsername(account.discogsUsername || '');
      setTokenPreview(account.tokenPreview);
      setTokenConfigured(account.tokenConfigured);
    }).catch((nextError) => setError(nextError.message));
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const account = await api.updateAccount({ discogsUsername, discogsToken: newToken });
      setTokenPreview(account.tokenPreview);
      setTokenConfigured(account.tokenConfigured);
      setNewToken('');
      toast.success(account.message || t('settings.saved'));
      await refreshAccount();
    } catch (nextError) {
      setError(nextError.message || t('settings.saveError'));
      toast.error(nextError.message || t('settings.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6">
        <p className="text-sm uppercase tracking-[0.35em] text-brand-200">{t('nav.settings')}</p>
        <h2 className="mt-2 font-display text-4xl text-white">{t('settings.title')}</h2>
        <p className="mt-2 text-sm text-slate-400">{t('settings.subtitle')}</p>
      </section>

      <form onSubmit={handleSave} className="glass-panel space-y-5 p-6">
        <div>
          <h3 className="font-display text-2xl text-white">{t('settings.accountTitle')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('settings.accountSubtitle')}</p>
        </div>

        <label className="block space-y-2 text-sm text-slate-300">
          <span>{t('settings.discogsUser')}</span>
          <input value={discogsUsername} onChange={(e) => setDiscogsUsername(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
        </label>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          {tokenConfigured ? t('settings.currentToken', { token: tokenPreview }) : t('settings.noToken')}
        </div>

        <label className="block space-y-2 text-sm text-slate-300">
          <span>{tokenConfigured ? t('settings.newTokenOptional') : t('settings.discogsToken')}</span>
          <input value={newToken} onChange={(e) => setNewToken(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none focus:border-brand-300" />
        </label>
        {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <button type="submit" disabled={saving} className="primary-button disabled:opacity-60">
          {saving ? t('settings.saving') : t('settings.save')}
        </button>
      </form>

      <section className="glass-panel flex items-center justify-between gap-4 p-6">
        <div>
          <h3 className="font-display text-2xl text-white">{t('settings.resetTitle')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('settings.resetSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(t('settings.resetConfirm'))) return;
            try {
              const result = await api.resetCollection();
              toast.success(result.message);
            } catch (nextError) {
              setError(nextError.message);
              toast.error(nextError.message);
            }
          }}
          className="secondary-button text-rose-300 hover:text-rose-100"
        >
          {t('settings.reset')}
        </button>
      </section>

      {isAdmin && <AdminPanel />}

      <section className="glass-panel flex items-center justify-between gap-4 p-6">
        <div>
          <h3 className="font-display text-2xl text-white">{t('settings.sessionTitle')}</h3>
          <p className="mt-1 text-sm text-slate-400">{t('settings.sessionSubtitle')}</p>
        </div>
        <button type="button" onClick={logout} className="secondary-button">{t('app.logout')}</button>
      </section>
    </div>
  );
}

export default Settings;
