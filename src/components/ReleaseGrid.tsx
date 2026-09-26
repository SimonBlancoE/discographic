import { memo } from 'react';
import { Link } from 'react-router';
import { hasPricedMarketplaceValue } from '../../shared/contracts/marketplace.js';
import type { CollectionRelease } from '../../shared/contracts/release.js';
import type { Currency } from '../../shared/currency.js';
import { formatCompactNumber, formatCurrency } from '../lib/format';
import { useI18n } from '../lib/I18nContext';
import ConditionBadge from './ConditionBadge';
import CoverImage from './CoverImage';

function ReleaseCard({ release, currency }: { release: CollectionRelease; currency: Currency }) {
  const { t } = useI18n();
  const localCoverUrl = release.id && release.cover_url ? `/api/media/cover/${release.id}?variant=wall` : null;

  return (
    <Link to={`/release/${release.id}`} className="release-card group">
      <div className="release-card__cover">
        <CoverImage
          src={localCoverUrl}
          fallbackSrc={release.cover_url}
          alt=""
          loading="lazy"
          placeholderClassName="h-full w-full"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-linear-to-t from-black/80 via-black/30 to-transparent p-2.5 pt-8">
          <ConditionBadge value={release.media_condition} kind="media" hideUngraded />
          {release.rating > 0 ? (
            <span className="ml-auto rounded-md bg-black/50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300" aria-label={t('collection.ratingValue', { value: release.rating })}>
              ★ {release.rating}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-white group-hover:text-brand-100">{release.title}</p>
        <p className="truncate text-xs text-slate-400">{release.artist}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-slate-500">
          <span>{release.year || '—'}</span>
          {hasPricedMarketplaceValue(release) ? (
            <span className="font-medium text-brand-100">{formatCurrency(release.estimated_value, currency)}</span>
          ) : release.community_want ? (
            <span className="text-brand-200/80" title={t('collection.demand')}>♥ {formatCompactNumber(release.community_want)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function ReleaseGrid({ releases, currency }: { releases: CollectionRelease[]; currency: Currency }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {releases.map((release) => (
        <ReleaseCard key={`${release.id}-${release.instance_id}`} release={release} currency={currency} />
      ))}
    </div>
  );
}

export default memo(ReleaseGrid);
