import { describe, expect, it } from 'vitest';
import {
  normalizeAccountResponse,
  normalizeAccountState,
  normalizeAuthStatus
} from '../shared/contracts/account.js';
import { DEFAULT_CURRENCY } from '../shared/currency.js';

const user = {
  id: '3',
  username: 'collector',
  role: 'admin',
  created_at: '2026-04-20T08:00:00.000Z'
};

describe('account contract', () => {
  it('normalizes logged-out account state with no collection capabilities', () => {
    const state = normalizeAccountState({
      auth: { needsBootstrap: true, loggedIn: false, user: null }
    });

    expect(state).toEqual({
      needsBootstrap: true,
      loggedIn: false,
      user: null,
      isAdmin: false,
      accountUnavailable: false,
      discogs: {
        username: null,
        tokenConfigured: false,
        tokenPreview: null
      },
      preferences: {
        currency: DEFAULT_CURRENCY
      },
      capabilities: {
        canUseCollection: false,
        canSyncDiscogs: false,
        canImport: false,
        canExport: false,
        canManageAccount: false,
        canAdminUsers: false
      }
    });
  });

  it('normalizes a logged-in user without Discogs configuration', () => {
    const state = normalizeAccountState({
      auth: { needsBootstrap: false, loggedIn: true, user },
      account: { discogsUsername: '', tokenConfigured: false, tokenPreview: null, currency: 'usd' }
    });

    expect(state.user).toEqual({
      id: 3,
      username: 'collector',
      role: 'admin',
      created_at: '2026-04-20T08:00:00.000Z'
    });
    expect(state.isAdmin).toBe(true);
    expect(state.discogs.tokenConfigured).toBe(false);
    expect(state.preferences.currency).toBe('USD');
    expect(state.capabilities.canManageAccount).toBe(true);
    expect(state.capabilities.canUseCollection).toBe(false);
    expect(state.capabilities.canAdminUsers).toBe(true);
  });

  it('normalizes a logged-in user with Discogs configuration and enabled workflows', () => {
    const state = normalizeAccountState({
      auth: { needsBootstrap: false, loggedIn: true, user: { ...user, role: 'user' } },
      account: { discogsUsername: 'miles', tokenConfigured: true, tokenPreview: 'abcd...wxyz', currency: 'GBP' }
    });

    expect(state.discogs).toEqual({
      username: 'miles',
      tokenConfigured: true,
      tokenPreview: 'abcd...wxyz'
    });
    expect(state.preferences.currency).toBe('GBP');
    expect(state.capabilities).toEqual({
      canUseCollection: true,
      canSyncDiscogs: true,
      canImport: true,
      canExport: true,
      canManageAccount: true,
      canAdminUsers: false
    });
  });

  it('keeps Discogs facts unknown when the account endpoint is unavailable', () => {
    const state = normalizeAccountState({
      auth: { needsBootstrap: false, loggedIn: true, user },
      accountUnavailable: true
    });

    expect(state.accountUnavailable).toBe(true);
    expect(state.discogs).toEqual({
      username: null,
      tokenConfigured: null,
      tokenPreview: null
    });
    expect(state.preferences.currency).toBe(DEFAULT_CURRENCY);
    expect(state.capabilities.canUseCollection).toBe(false);
    expect(state.capabilities.canManageAccount).toBe(false);
  });

  it('normalizes existing auth and account endpoint payloads independently', () => {
    expect(normalizeAuthStatus({ needsBootstrap: 0, loggedIn: 1, user })).toMatchObject({
      needsBootstrap: false,
      loggedIn: true,
      user: { id: 3, username: 'collector' }
    });

    expect(normalizeAccountResponse({
      discogsUsername: ' miles ',
      tokenConfigured: 1,
      tokenPreview: 'abcd...wxyz',
      currency: 'gbp'
    })).toEqual({
      discogsUsername: 'miles',
      tokenConfigured: true,
      tokenPreview: 'abcd...wxyz',
      currency: 'GBP'
    });
  });
});
