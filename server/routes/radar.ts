import express from 'express';
import {
  MARKETPLACE_STATUS,
  RADAR_MINIMUM_CONDITION,
  RADAR_PRIORITY,
  normalizeRadarResponse,
  type RadarLocalDecisionUpdate,
  type RadarMinimumCondition,
  type RadarPriority,
  type RadarRelease,
  type RadarResponse,
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

type ExchangeRates = Parameters<typeof convertAmountWithRates>[3];

const RADAR_PRIORITIES = new Set<RadarPriority>(Object.values(RADAR_PRIORITY));
const RADAR_MINIMUM_CONDITIONS = new Set<RadarMinimumCondition>(Object.values(RADAR_MINIMUM_CONDITION));

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

function isRadarPriority(value: unknown): value is RadarPriority {
  return RADAR_PRIORITIES.has(value as RadarPriority);
}

function isRadarMinimumCondition(value: unknown): value is RadarMinimumCondition {
  return RADAR_MINIMUM_CONDITIONS.has(value as RadarMinimumCondition);
}

function parseRadarPriority(value: unknown): RadarPriority {
  if (!isRadarPriority(value)) {
    throw new Error('priority is required');
  }

  return value;
}

function parseRadarMinimumCondition(value: unknown): RadarMinimumCondition | null {
  if (value == null || value === '') {
    return null;
  }

  if (!isRadarMinimumCondition(value)) {
    throw new Error('minimum_condition is invalid');
  }

  return value;
}

function parseRadarNote(value: unknown): string {
  if (value != null && typeof value !== 'string') {
    throw new Error('note must be a string');
  }

  return typeof value === 'string' ? value : '';
}

function getDisplayCurrency(userId: number): string {
  return normalizeCurrency(getSettingForUser(userId, 'currency') ?? DEFAULT_CURRENCY);
}

async function getDisplayRates(displayCurrency: string): Promise<ExchangeRates> {
  const snapshot = await getExchangeSnapshot([displayCurrency]);
  return snapshot.rates;
}

function convertNullableAmount(
  amount: number | null,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRates,
): number | null {
  return amount == null ? null : convertAmountWithRates(amount, fromCurrency, toCurrency, rates);
}

function serializeRadarRelease(
  item: RadarRelease,
  displayCurrency: string,
  rates: ExchangeRates,
): RadarRelease {
  return {
    ...item,
    local: {
      ...item.local,
      target_price: convertNullableAmount(item.local.target_price_eur, DEFAULT_CURRENCY, displayCurrency, rates),
    },
    marketplace: {
      ...item.marketplace,
      estimated_price: convertNullableAmount(item.marketplace.estimated_price, DEFAULT_CURRENCY, displayCurrency, rates),
      listing_price: convertNullableAmount(item.marketplace.listing_price_eur, DEFAULT_CURRENCY, displayCurrency, rates),
    },
    display_currency: displayCurrency,
  };
}

async function serializeRadar(userId: number, displayCurrency = getDisplayCurrency(userId)): Promise<RadarResponse> {
  const radar = getRadarForUser(userId);
  const rates = await getDisplayRates(displayCurrency);

  return normalizeRadarResponse({
    items: radar.items.map((item) => serializeRadarRelease(item, displayCurrency, rates)),
    summary: radar.summary,
  });
}

async function parseTargetPriceEur(userId: number, value: unknown): Promise<number | null> {
  if (value == null || value === '') {
    return null;
  }

  const parsedTargetPrice = Number(value);
  if (!Number.isFinite(parsedTargetPrice) || parsedTargetPrice < 0) {
    throw new Error('target_price must be a non-negative number');
  }

  const displayCurrency = getDisplayCurrency(userId);
  const rates = await getDisplayRates(displayCurrency);
  return convertAmountWithRates(parsedTargetPrice, displayCurrency, DEFAULT_CURRENCY, rates);
}

async function parseRadarUpdatePayload(userId: number, payload: unknown): Promise<RadarLocalDecisionUpdate> {
  const source = asRecord(payload) ?? {};
  const local = asRecord(source.local) ?? source;

  const priority = parseRadarPriority(local.priority);
  const minimumCondition = parseRadarMinimumCondition(local.minimum_condition);
  const hidden = asBoolean(local.hidden);
  const resolved = asBoolean(local.resolved);
  if (hidden == null || resolved == null) {
    throw new Error('hidden and resolved are required');
  }

  const note = parseRadarNote(local.note);
  const targetPriceEur = await parseTargetPriceEur(userId, local.target_price);

  return {
    priority,
    targetPriceEur,
    minimumCondition,
    note,
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
