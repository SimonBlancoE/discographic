import { describe, expect, it } from 'vitest';
import {
  RADAR_ENRICH_STATUS,
  MARKETPLACE_STATUS,
  RADAR_MINIMUM_CONDITION,
  normalizeRadarEnrichmentStatus,
  normalizeRadarResponse,
  normalizeRadarSyncResponse,
  RADAR_PRIORITY,
  RADAR_SOURCE_ORIGIN,
  RADAR_SOURCE_STATUS,
  normalizeRadarWantlistPreviewResponse,
} from '../shared/contracts/radar.js';

describe('radar contract', () => {
  it('normalizes missing payload sections into a stable empty list contract', () => {
    expect(normalizeRadarResponse({})).toEqual({
      items: [],
      summary: {
        total: 0,
        active: 0,
        hidden: 0,
        resolved: 0,
        missingFromSource: 0,
        priced: 0,
        pending: 0,
        failed: 0,
        unavailable: 0,
      },
    });
  });

  it('normalizes malformed stored Radar rows into stable list items and counts', () => {
    const normalized = normalizeRadarResponse({
      items: [
        {
          id: '7',
          user_id: '2',
          release_id: '501',
          title: 9,
          artist: null,
          year: '1998',
          cover_url: 42,
          date_added: 12,
          local: {
            priority: 'urgent',
            target_price: '21.8',
            target_price_eur: '17.4',
            minimum_condition: 'bad',
            note: ['bad'],
            hidden: 1,
            resolved: 0,
          },
          source: {
            origin: 'mystery',
            status: 'gone',
            last_seen_at: 8,
          },
          marketplace: {
            status: 'ready',
            estimated_price: '15.2',
            listing_status: 9,
            listing_price: '12.1',
            listing_currency: 7,
            listing_price_eur: '11.5',
            last_checked_at: 5,
          },
          timestamps: {
            created_at: '2026-05-10T00:00:00Z',
            updated_at: 1,
          },
          opportunity: {
            reasons: ['below_target', 'mystery'],
            default_visible: 1,
            is_in_collection: 0,
          },
          display_currency: 3,
        },
        {
          title: 'drop me',
        },
      ],
      summary: {
        total: '4',
        active: '3',
        hidden: '2',
        resolved: '1',
        missingFromSource: '5',
        priced: '6',
        pending: '7',
        failed: '8',
        unavailable: '9',
      },
    });

    expect(normalized.items).toEqual([
      {
        id: 7,
        user_id: 2,
        release_id: 501,
        title: '-',
        artist: '-',
        year: 1998,
        cover_url: null,
        date_added: null,
        local: {
          priority: RADAR_PRIORITY.NORMAL,
          target_price: 21.8,
          target_price_eur: 17.4,
          minimum_condition: null,
          note: '',
          hidden: true,
          resolved: false,
        },
        source: {
          origin: RADAR_SOURCE_ORIGIN.NONE,
          status: RADAR_SOURCE_STATUS.ACTIVE,
          last_seen_at: null,
        },
        marketplace: {
          status: MARKETPLACE_STATUS.PENDING,
          estimated_price: 15.2,
          last_checked_at: null,
        },
        timestamps: {
          created_at: '2026-05-10T00:00:00Z',
          updated_at: null,
        },
        opportunity: {
          reasons: ['below_target'],
          default_visible: true,
          is_in_collection: false,
        },
        display_currency: null,
      },
    ]);

    expect(normalized.summary).toEqual({
      total: 4,
      active: 3,
      hidden: 2,
      resolved: 1,
      missingFromSource: 5,
      priced: 6,
      pending: 7,
      failed: 8,
      unavailable: 9,
    });
  });

  it('normalizes sync responses into stable Radar data and counts', () => {
    const normalized = normalizeRadarSyncResponse({
      result: {
        totalFetched: '4',
        added: '2',
        updated: '1',
        reactivated: '0',
        markedMissing: '1',
        ignored: 'bad',
      },
    });

    expect(normalized).toEqual({
      radar: {
        items: [],
        summary: {
          total: 0,
          active: 0,
          hidden: 0,
          resolved: 0,
          missingFromSource: 0,
          priced: 0,
          pending: 0,
          failed: 0,
          unavailable: 0,
        },
      },
      result: {
        totalFetched: 4,
        added: 2,
        updated: 1,
        reactivated: 0,
        markedMissing: 1,
        ignored: 0,
      },
    });
  });

  it('preserves recognized minimum condition values and display currency fields', () => {
    const normalized = normalizeRadarResponse({
      items: [
        {
          id: 4,
          user_id: 2,
          release_id: 77,
          title: 'Known',
          artist: 'Condition Test',
          local: {
            priority: RADAR_PRIORITY.LOW,
            target_price: 12,
            target_price_eur: 10,
            minimum_condition: RADAR_MINIMUM_CONDITION.NEAR_MINT,
            note: 'keep it local',
            hidden: 0,
            resolved: 0,
          },
          source: {
            origin: RADAR_SOURCE_ORIGIN.FILE,
            status: RADAR_SOURCE_STATUS.ACTIVE,
          },
          marketplace: {
            status: MARKETPLACE_STATUS.PRICED,
          },
          opportunity: {
            reasons: ['available_again', 'already_in_collection'],
            default_visible: true,
            is_in_collection: true,
          },
          display_currency: 'USD',
        },
      ],
    });

    expect(normalized.items[0]?.local.minimum_condition).toBe(RADAR_MINIMUM_CONDITION.NEAR_MINT);
    expect(normalized.items[0]?.local.target_price).toBe(12);
    expect(normalized.items[0]?.opportunity).toEqual({
      reasons: ['available_again', 'already_in_collection'],
      default_visible: true,
      is_in_collection: true,
    });
    expect(normalized.items[0]?.display_currency).toBe('USD');
  });

  it('normalizes Wantlist preview responses without trusting malformed column keys', () => {
    const normalized = normalizeRadarWantlistPreviewResponse({
      previewId: 'preview-1',
      summary: {
        totalRows: '3',
        validRows: '1',
        invalidRows: '2',
      },
      mappedColumns: [
        { header: 'release_id', key: 'release_id', required: true },
        { header: 'bad', key: 'unexpected', required: true },
        { header: '', key: 'artist', required: false },
      ],
      ignoredColumns: ['Color', 2],
      rows: [
        {
          row: '2',
          release_id: '303',
          artist: 'Editable Release',
          title: 'Artist C',
          target_price: '12.5',
          minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
          priority: 'urgent',
        },
        {
          row: '3',
          release_id: 0,
        },
      ],
      errors: [
        {
          row: '3',
          column: 'release_id',
          value: 'bad',
          reason: 'Release ID must be a positive integer.',
        },
      ],
    });

    expect(normalized).toMatchObject({
      previewId: 'preview-1',
      summary: {
        totalRows: 3,
        validRows: 1,
        invalidRows: 2,
      },
      mappedColumns: [
        { header: 'release_id', key: 'release_id', required: true },
      ],
      ignoredColumns: ['Color'],
      rows: [
        {
          row: 2,
          release_id: 303,
          target_price: 12.5,
          minimum_condition: RADAR_MINIMUM_CONDITION.VERY_GOOD_PLUS,
          priority: null,
        },
      ],
      errors: [
        {
          row: 3,
          column: 'release_id',
          value: 'bad',
          reason: 'Release ID must be a positive integer.',
        },
      ],
    });
  });

  it('normalizes Radar enrichment status into a stable progress contract', () => {
    expect(normalizeRadarEnrichmentStatus()).toEqual({
      status: RADAR_ENRICH_STATUS.IDLE,
      current: 0,
      total: 0,
      pending: 0,
      progressPercent: 0,
      message: '',
      startedAt: null,
      finishedAt: null,
      isRunning: false,
      isTerminal: false,
    });

    expect(normalizeRadarEnrichmentStatus({
      status: 'stopped',
      current: '3',
      total: '12',
      pending: '9',
      message: 'Stopped after 3',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
    })).toEqual({
      status: RADAR_ENRICH_STATUS.STOPPED,
      current: 3,
      total: 12,
      pending: 9,
      progressPercent: 25,
      message: 'Stopped after 3',
      startedAt: '2026-05-10T10:00:00.000Z',
      finishedAt: '2026-05-10T10:01:00.000Z',
      isRunning: false,
      isTerminal: true,
    });
  });
});
