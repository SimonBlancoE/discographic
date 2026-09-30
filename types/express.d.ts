import type { NormalizedUser } from '../shared/contracts/account.js';
import type { Session, SessionData } from 'express-session';
import type { DiscogsClient } from '../server/discogs.js';
import type { TranslationVars } from '../shared/i18n.js';
import type { UserJobScope } from '../server/services/userJobs.js';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    authEpoch?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      locale: string;
      session: Session & Partial<SessionData>;
      t: (key: string, vars?: TranslationVars) => string;
      discogsClient?: DiscogsClient;
      accountScope?: UserJobScope;
      user?: NormalizedUser | null;
    }
  }
}

export {};
