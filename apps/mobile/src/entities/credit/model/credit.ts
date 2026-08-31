/** One row of the server's credit ledger, newest first. */
export type CreditEntry = {
  id: string;
  /** +grant / −spend, in credits. 100 credits is one movie export. */
  delta: number;
  /**
   * Why the row exists (`purchase`, `ad_reward`, `export_reserve`, …). Kept a
   * plain string on purpose: a reason the backend adds later must not fail the
   * whole balance response — screens map the reasons they know to copy and
   * fall back for the rest.
   */
  reason: string;
  createdAt: Date;
};

/**
 * The signed-in user's credit balance with its most recent ledger rows.
 *
 * The balance's only source is the backend — nothing in the app derives or
 * adjusts it locally, because grants land server-side (store webhooks, ad-view
 * verification) where the app cannot see them happen. The entries are the
 * server's window (newest 50), not the full history.
 */
export type CreditBalance = {
  balance: number;
  entries: CreditEntry[];
};
