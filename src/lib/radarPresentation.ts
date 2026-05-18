import {
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
  type RadarLocalDecisionPayload,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
} from '../../shared/contracts/radar.js';

export const RADAR_PRIORITY_OPTIONS: RadarPriority[] = [
  RADAR_PRIORITY.LOW,
  RADAR_PRIORITY.NORMAL,
  RADAR_PRIORITY.HIGH,
];

export const RADAR_MINIMUM_CONDITION_OPTIONS = [
  RADAR_MINIMUM_CONDITION.MINT,
  RADAR_MINIMUM_CONDITION.NEAR_MINT,
  RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
  RADAR_MINIMUM_CONDITION.VERY_GOOD,
  RADAR_MINIMUM_CONDITION.GOOD_PLUS,
  RADAR_MINIMUM_CONDITION.GOOD,
  RADAR_MINIMUM_CONDITION.FAIR,
  RADAR_MINIMUM_CONDITION.POOR,
] as const;

export type RadarStateLabelKey =
  | 'radar.state.hidden'
  | 'radar.state.resolved'
  | 'radar.state.missingFromSource';

export type RadarCollectionMatchLabelKey =
  | 'radar.collectionMatch.single'
  | 'radar.collectionMatch.multiple';

export type RadarReleaseDraft = {
  priority: RadarPriority;
  targetPrice: string;
  minimumCondition: RadarMinimumCondition | '';
  note: string;
  hidden: boolean;
  resolved: boolean;
};

export function createRadarReleaseDraft(item: RadarRelease): RadarReleaseDraft {
  return {
    priority: item.local.priority,
    targetPrice: item.local.target_price == null ? '' : item.local.target_price.toFixed(2),
    minimumCondition: item.local.minimum_condition ?? '',
    note: item.local.note,
    hidden: item.local.hidden,
    resolved: item.local.resolved,
  };
}

export function createRadarReleasePayload(draft: RadarReleaseDraft): RadarLocalDecisionPayload {
  return {
    local: {
      priority: draft.priority,
      target_price: draft.targetPrice.trim() ? Number(draft.targetPrice) : null,
      minimum_condition: draft.minimumCondition || null,
      note: draft.note,
      hidden: draft.hidden,
      resolved: draft.resolved,
    },
  };
}

export function areRadarReleaseDraftsEqual(left: RadarReleaseDraft, right: RadarReleaseDraft): boolean {
  return left.priority === right.priority
    && left.targetPrice === right.targetPrice
    && left.minimumCondition === right.minimumCondition
    && left.note === right.note
    && left.hidden === right.hidden
    && left.resolved === right.resolved;
}

export function getRadarCollectionMatchLabelKey(copyCount: number): RadarCollectionMatchLabelKey {
  return copyCount === 1
    ? 'radar.collectionMatch.single'
    : 'radar.collectionMatch.multiple';
}

export function getRadarStateLabelKeys(item: RadarRelease): RadarStateLabelKey[] {
  const labelKeys: RadarStateLabelKey[] = [];

  if (item.source.status === RADAR_SOURCE_STATUS.MISSING) {
    labelKeys.push('radar.state.missingFromSource');
  }

  if (item.local.hidden) {
    labelKeys.push('radar.state.hidden');
  }

  if (item.local.resolved) {
    labelKeys.push('radar.state.resolved');
  }

  return labelKeys;
}

export function getRadarSourceOriginLabelKey(origin: RadarRelease['source']['origin']) {
  switch (origin) {
    case RADAR_SOURCE_ORIGIN.DISCOGS:
      return 'radar.sourceOrigin.discogs';
    case RADAR_SOURCE_ORIGIN.FILE:
      return 'radar.sourceOrigin.file';
    case RADAR_SOURCE_ORIGIN.BOTH:
      return 'radar.sourceOrigin.both';
    case RADAR_SOURCE_ORIGIN.NONE:
      return 'radar.sourceOrigin.none';
    default:
      return 'radar.sourceOrigin.none';
  }
}

export function getRadarSourceStatusLabelKey(status: RadarRelease['source']['status']) {
  return status === RADAR_SOURCE_STATUS.MISSING
    ? 'radar.sourceStatus.missing'
    : 'radar.sourceStatus.active';
}
