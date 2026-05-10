import express from 'express';
import {
  MARKETPLACE_STATUS,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  normalizeRadarResponse,
} from '../../shared/contracts/radar.js';
import { getRadarForUser, getSettingForUser, updateRadarReleaseForUser } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  DEFAULT_CURRENCY,
  convertAmountWithRates,
  getExchangeSnapshot,
  normalizeCurrency,
} from '../services/exchangeRates.js';

const router = express.Router();

router.use(requireAuth);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asBoolean(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 1) {
    return true;
  }

  if (value === false || value === 'false' || value === 0) {
    return false;
  }

  return null;
}

function getDisplayCurrency(userId: number) {
  return normalizeCurrency(getSettingForUser(userId, 'currency') ?? DEFAULT_CURRENCY);
}

async function getDisplayRates(displayCurrency: string) {
  const snapshot = await getExchangeSnapshot([displayCurrency]);
  return snapshot.rates;
}

async function serializeRadar(userId: number, displayCurrency = getDisplayCurrency(userId)) {
  const radar = getRadarForUser(userId);
  const rates = await getDisplayRates(displayCurrency);

  return normalizeRadarResponse({
    items: radar.items.map((item) => ({
      ...item,
      local: {
        ...item.local,
        target_price: item.local.target_price_eur == null
          ? null
          : convertAmountWithRates(item.local.target_price_eur, DEFAULT_CURRENCY, displayCurrency, rates),
      },
      marketplace: {
        ...item.marketplace,
        estimated_price: item.marketplace.estimated_price == null
          ? null
          : convertAmountWithRates(item.marketplace.estimated_price, DEFAULT_CURRENCY, displayCurrency, rates),
        listing_price: item.marketplace.listing_price_eur == null
          ? null
          : convertAmountWithRates(item.marketplace.listing_price_eur, DEFAULT_CURRENCY, displayCurrency, rates),
      },
      display_currency: displayCurrency,
    })),
    summary: radar.summary,
  });
}

async function parseRadarUpdatePayload(userId: number, payload: unknown) {
  const source = asRecord(payload);
  const local = asRecord(source?.local) ?? source ?? {};

  const priority = local.priority;
  if (!Object.values(RADAR_PRIORITY).includes(priority as (typeof RADAR_PRIORITY)[keyof typeof RADAR_PRIORITY])) {
    throw new Error('priority is required');
  }

  const minimumCondition = local.minimum_condition;
  const normalizedMinimumCondition = minimumCondition == null || minimumCondition === ''
    ? null
    : minimumCondition;
  if (
    normalizedMinimumCondition != null &&
    !Object.values(RADAR_MINIMUM_CONDITION).includes(
      normalizedMinimumCondition as (typeof RADAR_MINIMUM_CONDITION)[keyof typeof RADAR_MINIMUM_CONDITION],
    )
  ) {
    throw new Error('minimum_condition is invalid');
  }

  const hidden = asBoolean(local.hidden);
  const resolved = asBoolean(local.resolved);
  if (hidden == null || resolved == null) {
    throw new Error('hidden and resolved are required');
  }

  const note = local.note;
  if (note != null && typeof note !== 'string') {
    throw new Error('note must be a string');
  }

  const rawTargetPrice = local.target_price;
  let targetPriceEur: number | null = null;
  if (rawTargetPrice != null && rawTargetPrice !== '') {
    const parsedTargetPrice = Number(rawTargetPrice);
    if (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice < 0) {
      throw new Error('target_price must be a non-negative number');
    }

    const displayCurrency = getDisplayCurrency(userId);
    const rates = await getDisplayRates(displayCurrency);
    targetPriceEur = convertAmountWithRates(parsedTargetPrice, displayCurrency, DEFAULT_CURRENCY, rates);
  }

  return {
    priority,
    targetPriceEur,
    minimumCondition: normalizedMinimumCondition,
    note: typeof note === 'string' ? note : '',
    hidden,
    resolved,
  };
}

router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    res.json(await serializeRadar(userId));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : req.t('backend.server.internal') });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (userId == null) {
      return res.status(401).json({ error: req.t('backend.auth.required') });
    }

    const radarId = Number(req.params.id);
    if (!Number.isInteger(radarId) || radarId < 1) {
      return res.status(400).json({ error: 'Radar release id is invalid' });
    }

    const patch = await parseRadarUpdatePayload(userId, req.body);
    const updated = updateRadarReleaseForUser(userId, radarId, patch);
    if (!updated) {
      return res.status(404).json({ error: 'Radar release not found' });
    }

    return res.json(await serializeRadar(userId));
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Radar update failed' });
  }
});

export default router;
export { MARKETPLACE_STATUS };
