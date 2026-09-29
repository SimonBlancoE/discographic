import { conditionShortLabel } from '../../shared/contracts/collectionFields.js';
import { useI18n } from '../lib/I18nContext';

// Grades from best to worst share a green → red ramp so the collection's state reads at a glance.
const GRADE_TONES: Record<string, string> = {
  M: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  NM: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  'VG+': 'border-lime-400/30 bg-lime-400/10 text-lime-200',
  VG: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  'G+': 'border-orange-400/30 bg-orange-400/10 text-orange-200',
  G: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
  F: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  P: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
};

function ConditionBadge({ value, kind, hideUngraded = false }: { value: string | null | undefined; kind: 'media' | 'sleeve'; hideUngraded?: boolean }) {
  const { t } = useI18n();

  if (!value) {
    return kind === 'media' && !hideUngraded ? <span className="text-xs text-slate-500">{t('condition.ungraded')}</span> : null;
  }

  const short = conditionShortLabel(value);
  const tone = GRADE_TONES[short] ?? 'border-white/10 bg-white/5 text-slate-300';
  const label = kind === 'media' ? t('condition.media') : t('condition.sleeve');

  return (
    <span title={`${label}: ${value}`} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {kind === 'sleeve' ? <span className="font-normal opacity-70">{t('condition.sleeveShort')}</span> : null}
      {short}
    </span>
  );
}

export default ConditionBadge;
