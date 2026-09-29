import { useMemo, useRef, useState } from 'react';
import { downloadNodeAsPng } from '../lib/exportImage';
import { getErrorMessage } from '../lib/errors';
import { formatNumber } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import { useToast } from '../lib/ToastContext';
import type { AchievementSet, HiddenAchievement, TieredAchievement } from '../lib/types';

function TierBadge({ achievement }: { achievement: TieredAchievement }) {
  const { t } = useI18n();
  const { tier } = achievement;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-500">
        <span>{tier.currentTier}</span>
        <span>{t('achievements.tiers', { current: tier.unlockedTierCount, total: tier.totalTiers })}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-950/70">
        <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max(8, (tier.unlockedTierCount / tier.totalTiers) * 100)}%`, opacity: achievement.progress ? 1 : 0.18 }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{formatNumber(achievement.progress)}</span>
        <span>{tier.nextGoal ? t('achievements.next', { label: tier.nextLabel, goal: tier.nextGoal }) : t('achievements.max')}</span>
      </div>
    </div>
  );
}

function PublicAchievementCard({ achievement }: { achievement: TieredAchievement }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-5 transition ${achievement.unlocked ? 'border-brand-300/25 bg-brand-400/5' : 'border-white/5 bg-white/5'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-3xl" aria-hidden="true">{achievement.emoji}</div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] ${achievement.tier.completed ? 'bg-brand-400/15 text-brand-100' : 'bg-white/5 text-slate-300'}`}>
          {achievement.badgeText}
        </span>
      </div>
      <h4 className="mt-3 font-display text-xl text-white">{achievement.title}</h4>
      <p className="mt-2 text-sm text-slate-400">{achievement.description}</p>

      <div className="mt-5">
        <TierBadge achievement={achievement} />
      </div>
    </div>
  );
}

function HiddenAchievementCard({ achievement }: { achievement: HiddenAchievement }) {
  const { t } = useI18n();
  const hidden = !achievement.unlocked;

  return (
    <div className={`min-w-0 rounded-xl border p-4 transition ${hidden ? 'border-dashed border-white/8 bg-black/20' : 'border-brand-300/20 bg-brand-400/5'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-2xl opacity-90" aria-hidden="true">{hidden ? '🫥' : achievement.emoji}</div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] ${hidden ? 'bg-white/5 text-slate-500' : 'bg-brand-400/20 text-brand-100'}`}>
          {achievement.badgeText}
        </span>
      </div>
      <h4 className="mt-3 font-display text-lg text-white">{hidden ? '???' : achievement.title}</h4>
      <p className="mt-2 text-sm text-slate-400">{hidden ? t('achievements.hiddenPlaceholder') : achievement.description}</p>
    </div>
  );
}

function AchievementsPanel({ achievements }: { achievements: AchievementSet }) {
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
      toast.error(t('achievements.exportError', { error: getErrorMessage(error, t('client.networkError')) }));
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
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.14em] text-brand-100">
            {t('achievements.unlocked', { count: unlockedCount, total: achievements.tiered.length + achievements.hidden.length })}
          </span>
          <button type="button" onClick={handleExport} disabled={exporting} className="secondary-button text-sm disabled:opacity-60">
            {exporting ? t('achievements.exporting') : t('achievements.export')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
      {achievements.tiered.map((achievement: TieredAchievement) => <PublicAchievementCard key={achievement.id} achievement={achievement} />)}
      </div>

      <div className="rounded-2xl border border-white/5 bg-slate-950/35 p-5">
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
            {achievements.hidden.map((achievement: HiddenAchievement) => <HiddenAchievementCard key={achievement.id} achievement={achievement} />)}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {achievements.hidden.slice(0, 3).map((achievement: HiddenAchievement) => (
              <HiddenAchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default AchievementsPanel;
