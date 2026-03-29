import { useMemo, useRef, useState } from 'react';
import { downloadNodeAsPng } from '../lib/exportImage';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';

function TierBadge({ achievement }) {
  const { t } = useI18n();
  const { tier } = achievement;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-500">
        <span>{tier.currentTier}</span>
        <span>{t('achievements.tiers', { current: tier.unlockedTierCount, total: tier.totalTiers })}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-950/70">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 via-amber-300 to-cyan-300" style={{ width: `${Math.max(8, (tier.unlockedTierCount / tier.totalTiers) * 100)}%`, opacity: achievement.progress ? 1 : 0.18 }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{formatNumber(achievement.progress)}</span>
        <span>{tier.nextGoal ? t('achievements.next', { label: tier.nextLabel, goal: tier.nextGoal }) : t('achievements.max')}</span>
      </div>
    </div>
  );
}

function PublicAchievementCard({ achievement }) {
  return (
    <div className={`rounded-[28px] border p-5 transition ${achievement.unlocked ? 'border-emerald-400/25 bg-emerald-500/10 shadow-[0_18px_40px_rgba(16,185,129,0.12)]' : 'border-white/5 bg-white/5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-3xl" aria-hidden="true">{achievement.emoji}</div>
          <h4 className="mt-3 font-display text-xl text-white">{achievement.title}</h4>
          <p className="mt-2 text-sm text-slate-400">{achievement.description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.25em] ${achievement.tier.completed ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/5 text-slate-300'}`}>
          {achievement.badgeText}
        </span>
      </div>

      <div className="mt-5">
        <TierBadge achievement={achievement} />
      </div>
    </div>
  );
}

function HiddenAchievementCard({ achievement }) {
  const { t } = useI18n();
  const hidden = !achievement.unlocked;

  return (
    <div className={`rounded-[24px] border p-4 transition ${hidden ? 'border-dashed border-white/8 bg-slate-950/35' : 'border-brand-300/20 bg-brand-500/10 shadow-[0_18px_36px_rgba(251,113,133,0.12)]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl opacity-90" aria-hidden="true">{hidden ? '🫥' : achievement.emoji}</div>
          <h4 className="mt-3 font-display text-lg text-white">{hidden ? '???' : achievement.title}</h4>
          <p className="mt-2 text-sm text-slate-400">{hidden ? t('achievements.hiddenPlaceholder') : achievement.description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.25em] ${hidden ? 'bg-white/5 text-slate-500' : 'bg-brand-400/20 text-brand-100'}`}>
          {achievement.badgeText}
        </span>
      </div>
    </div>
  );
}

function AchievementsPanel({ achievements }) {
  const { t } = useI18n();
  const toast = useToast();
  const sectionRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const unlockedCount = useMemo(() => achievements.tiered.filter((item) => item.unlocked).length + achievements.hidden.filter((item) => item.unlocked).length, [achievements]);
  const hiddenUnlocked = achievements.hidden.filter((item) => item.unlocked);

  async function handleExport() {
    if (!sectionRef.current) {
      return;
    }

    setExporting(true);
    try {
      await downloadNodeAsPng(sectionRef.current, `discographic-achievements-${new Date().toISOString().slice(0, 10)}.png`);
      toast.success(t('achievements.exported'));
    } catch (error) {
      toast.error(t('achievements.exportError', { error: error.message }));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section ref={sectionRef} className="glass-panel space-y-6 p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="font-display text-2xl text-white">{t('achievements.title')}</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{t('achievements.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.25em] text-brand-100">
            {t('achievements.unlocked', { count: unlockedCount, total: achievements.tiered.length + achievements.hidden.length })}
          </span>
          <button type="button" onClick={handleExport} disabled={exporting} className="secondary-button text-sm disabled:opacity-60">
            {exporting ? t('achievements.exporting') : t('achievements.export')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {achievements.tiered.map((achievement) => <PublicAchievementCard key={achievement.id} achievement={achievement} />)}
      </div>

      <div className="rounded-[28px] border border-white/5 bg-slate-950/35 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h4 className="font-display text-xl text-white">{t('achievements.hiddenTitle')}</h4>
            <p className="mt-1 text-sm text-slate-400">{t('achievements.hiddenSubtitle')}</p>
          </div>
          <button type="button" onClick={() => setShowSecrets((current) => !current)} className="secondary-button text-sm">
            {showSecrets ? t('achievements.hideSecrets') : t('achievements.showSecrets', { count: hiddenUnlocked.length })}
          </button>
        </div>

        {showSecrets ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {achievements.hidden.map((achievement) => <HiddenAchievementCard key={achievement.id} achievement={achievement} />)}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {achievements.hidden.slice(0, 3).map((achievement) => (
              <HiddenAchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default AchievementsPanel;
