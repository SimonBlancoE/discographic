import type { Session, SessionData } from 'express-session';

type DiscogsClient = {
  getCollection: (page?: number, perPage?: number) => Promise<unknown>;
  getRelease: (releaseId: number) => Promise<unknown>;
  getCollectionValue: () => Promise<unknown>;
  updateRating: (input: {
    folderId?: number;
    releaseId: number;
    instanceId: number;
    rating: number;
  }) => Promise<unknown>;
  updateField: (input: {
    folderId?: number;
    releaseId: number;
    instanceId: number;
    fieldId: number;
    value: string;
  }) => Promise<unknown>;
  getMarketplaceStats: (releaseId: number, currency?: string) => Promise<unknown>;
  getInventory: (page?: number, perPage?: number) => Promise<unknown>;
  getCustomFields: () => Promise<unknown>;
};

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      locale: string;
      session: Session & Partial<SessionData>;
      t: (key: string, vars?: Record<string, unknown>) => string;
      discogsClient?: DiscogsClient;
      user?: {
        id: number;
        username: string;
        role: string;
        created_at: string | null;
      } | null;
    }
  }
}

export {};
