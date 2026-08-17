// Augments Express's Request type so `req.user` and `req.admin` — set
// by verifyToken.js / verifyAdminToken.js respectively — are typed
// everywhere without every controller having to redeclare or cast them.
// This file has no imports/exports of its own values (only `declare
// global`), so it's picked up automatically by anything that imports
// express — no explicit import needed in consuming files.

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  tag?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedAdminPayload {
  id: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by middleware/verifyToken.js after verifying the user's JWT. */
      user?: AuthenticatedUserPayload;
      /** Set by admin/middleware/verifyAdminToken.js after verifying the admin's JWT. */
      admin?: AuthenticatedAdminPayload;
      /** Raw request body bytes, captured by express.json()'s `verify` hook in app.ts. */
      rawBody?: Buffer;
    }
  }
}

export {};
