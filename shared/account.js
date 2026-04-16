// Shape of /api/account responses. The client AuthContext falls back to this
// constant before the first round-trip and the server `serializeAccount`
// returns the same fields.

import { DEFAULT_CURRENCY } from './currency.js';

export const EMPTY_ACCOUNT = Object.freeze({
  discogsUsername: '',
  tokenConfigured: false,
  tokenPreview: null,
  currency: DEFAULT_CURRENCY
});
