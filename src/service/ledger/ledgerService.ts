import mongoose, { type ClientSession } from "mongoose";
import User from "../../models/users.js";
import LedgerEntry, {
  type ILedgerEntry,
  type LedgerCategory,
  type LedgerDirection,
  type LedgerPerformedBy,
  type LedgerRelatedModel,
} from "../../models/ledgerEntry.js";

// ══════════════════════════════════════════════════════════════════
// Ledger service
//
// This is the ONLY place in the codebase allowed to change
// User.balance. Every other file that used to do
// `User.findOneAndUpdate(..., { $inc: { balance: amount } })`
// directly has been refactored to call creditWallet/debitWallet here
// instead — that's what makes the ledger trustworthy: if a balance
// can only ever move through this file, then the ledger is
// guaranteed to be a complete, gapless record of every naira that
// ever entered or left a wallet.
//
// Every write:
//   1. Runs inside a MongoDB multi-document transaction (session),
//      so the User.balance update and the LedgerEntry row either
//      both land or neither does — no more "Funding record exists
//      but balance was never credited" style drift.
//   2. Is idempotent via a caller-supplied `reference`. Re-submitting
//      the exact same reference (retry after timeout, duplicate
//      webhook delivery, a double-tapped button) returns the
//      original result instead of applying the change twice — this
//      is enforced by a unique index, not by application logic, so
//      it holds even under concurrent duplicate requests.
//   3. Uses a conditional balance filter for debits
//      (`balance: { $gte: amount }`), so two concurrent debits can
//      never both succeed and push a balance negative, even for the
//      same user hammering the endpoint from two devices at once.
// ══════════════════════════════════════════════════════════════════

export class InsufficientBalanceError extends Error {
  code = "INSUFFICIENT_BALANCE";
  statusCode = 402;

  constructor(message = "Insufficient wallet balance") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

export class LedgerError extends Error {
  code = "LEDGER_ERROR";
  statusCode = 500;

  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

interface MongoErrorLike {
  code?: number;
}

const isDuplicateKeyError = (err: unknown): boolean => {
  const code = (err as MongoErrorLike | undefined)?.code;
  return code === 11000 || code === 11001;
};

/**
 * Runs `fn(session)` inside a fresh MongoDB transaction and always
 * ends the session afterwards. `session.withTransaction` retries
 * automatically on transient transaction errors (e.g. write
 * conflicts under load), which is exactly what you want at
 * thousand-user scale.
 */
async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

export interface LedgerWriteResult {
  entry: ILedgerEntry & { _id: mongoose.Types.ObjectId };
  balance: number;
  duplicate: boolean;
}

interface WalletMutationParams {
  userId: mongoose.Types.ObjectId | string;
  amount: number;
  category: LedgerCategory;
  reference: string;
  description?: string;
  performedBy?: LedgerPerformedBy;
  performedByAdminId?: mongoose.Types.ObjectId | string | null;
  relatedModel?: LedgerRelatedModel;
  relatedId?: mongoose.Types.ObjectId | string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fetch an existing ledger entry by reference — used both for the
 * idempotent "already processed" response path and for callers who
 * just want to look up a past entry.
 */
export async function findByReference(reference: string) {
  return LedgerEntry.findOne({ reference }).lean();
}

/**
 * Look up the ledger entry that was written alongside a given
 * History/Funding/Voucher document — lets callers that only have the
 * related document (e.g. an admin looking at a History row) find its
 * ledger entry without needing to know the ledger reference string.
 */
export async function findEntryByRelated(
  relatedModel: LedgerRelatedModel,
  relatedId: mongoose.Types.ObjectId | string,
) {
  return LedgerEntry.findOne({ relatedModel, relatedId }).lean();
}

async function writeEntry(
  direction: LedgerDirection,
  {
    userId,
    amount,
    category,
    reference,
    description = "",
    performedBy = "SYSTEM",
    performedByAdminId = null,
    relatedModel = null,
    relatedId = null,
    metadata = {},
  }: WalletMutationParams,
): Promise<LedgerWriteResult> {
  const numericAmount = Number(amount);
  const verb = direction === "CREDIT" ? "Credit" : "Debit";
  if (!numericAmount || numericAmount <= 0) {
    throw new LedgerError(`${verb} amount must be a positive number`);
  }
  if (!reference) {
    throw new LedgerError("A unique reference is required for every ledger write");
  }

  try {
    return await runInTransaction<LedgerWriteResult>(async (session) => {
      let balanceBefore: number;
      let balanceAfter: number;

      if (direction === "CREDIT") {
        const user = await User.findById(userId).session(session).select("balance");
        if (!user) {
          throw new LedgerError("User not found");
        }

        balanceBefore = user.balance;
        balanceAfter = Math.round((balanceBefore + numericAmount) * 100) / 100;

        await User.updateOne(
          { _id: userId },
          { $inc: { balance: numericAmount }, $set: { lastTransaction: new Date() } },
          { session },
        );
      } else {
        const before = await User.findById(userId).session(session).select("balance");
        if (!before) {
          throw new LedgerError("User not found");
        }

        const updated = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: numericAmount } },
          { $inc: { balance: -numericAmount }, $set: { lastTransaction: new Date() } },
          { new: true, session, select: "balance" },
        );

        if (!updated) {
          throw new InsufficientBalanceError();
        }

        balanceAfter = updated.balance;
        balanceBefore = Math.round((balanceAfter + numericAmount) * 100) / 100;
      }

      const [entry] = await LedgerEntry.create(
        [
          {
            userId,
            direction,
            category,
            amount: numericAmount,
            balanceBefore,
            balanceAfter,
            reference,
            description,
            performedBy,
            performedByAdminId,
            relatedModel,
            relatedId,
            metadata,
          },
        ],
        { session },
      );

      return {
        entry: entry.toObject() as ILedgerEntry & { _id: mongoose.Types.ObjectId },
        balance: balanceAfter,
        duplicate: false,
      };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await findByReference(reference);
      if (existing) {
        const user = await User.findById(userId).select("balance").lean();
        return {
          entry: existing as ILedgerEntry & { _id: mongoose.Types.ObjectId },
          balance: user?.balance ?? existing.balanceAfter,
          duplicate: true,
        };
      }
    }
    throw error;
  }
}

/**
 * Credit a user's wallet. Safe to call concurrently and safe to
 * retry with the same `reference`.
 */
export async function creditWallet(params: WalletMutationParams): Promise<LedgerWriteResult> {
  return writeEntry("CREDIT", params);
}

/**
 * Debit a user's wallet. Throws InsufficientBalanceError if the
 * balance can't cover the amount at the moment the transaction
 * commits — this check is done via a conditional update
 * (`balance: { $gte: amount }`), not a separate read-then-write, so
 * it can't race with a concurrent debit on the same wallet.
 *
 * Safe to retry with the same `reference`.
 */
export async function debitWallet(params: WalletMutationParams): Promise<LedgerWriteResult> {
  return writeEntry("DEBIT", params);
}

interface ReverseDebitParams {
  originalReference: string;
  performedByAdminId?: mongoose.Types.ObjectId | string | null;
  description?: string;
}

/**
 * Reverse a previous DEBIT entry — credits the wallet back the same
 * amount and writes a new ADMIN_REVERSAL entry linked to the
 * original via `reversalOfReference`. The original entry is never
 * modified (ledger rows are immutable); the reversal is a new,
 * independent row, exactly like a real accounting reversal.
 *
 * Idempotent: reversing the same reference twice returns the first
 * reversal both times rather than crediting twice.
 */
export async function reverseDebit({
  originalReference,
  performedByAdminId = null,
  description = "Reversal of failed transaction",
}: ReverseDebitParams): Promise<LedgerWriteResult> {
  const original = await findByReference(originalReference);
  if (!original) {
    throw new LedgerError("Original ledger entry not found");
  }
  if (original.direction !== "DEBIT") {
    throw new LedgerError("Only debit entries can be reversed");
  }

  const reversalReference = `REV-${originalReference}`;

  const alreadyReversed = await findByReference(reversalReference);
  if (alreadyReversed) {
    const user = await User.findById(original.userId).select("balance").lean();
    return {
      entry: alreadyReversed as ILedgerEntry & { _id: mongoose.Types.ObjectId },
      balance: user?.balance ?? alreadyReversed.balanceAfter,
      duplicate: true,
    };
  }

  return creditWallet({
    userId: original.userId,
    amount: original.amount,
    category: "ADMIN_REVERSAL",
    reference: reversalReference,
    description,
    performedBy: "ADMIN",
    performedByAdminId,
    relatedModel: original.relatedModel,
    relatedId: original.relatedId,
    metadata: { reversalOfReference: originalReference },
  });
}

interface GetStatementOptions {
  page?: number;
  limit?: number;
  category?: LedgerCategory | null;
}

/**
 * Paginated per-user ledger statement — the "easy to track any
 * issue" view: every balance-affecting event for a user, in order,
 * with a running balance snapshot on each row.
 */
export async function getStatement(
  userId: mongoose.Types.ObjectId | string,
  { page = 1, limit = 20, category = null }: GetStatementOptions = {},
) {
  const filter: Record<string, unknown> = { userId };
  if (category) filter.category = category;

  const skip = (Number(page) - 1) * Number(limit);

  const [entries, total] = await Promise.all([
    LedgerEntry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    LedgerEntry.countDocuments(filter),
  ]);

  return {
    entries,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
}

/**
 * Recompute a user's balance purely from their ledger history —
 * used for reconciliation/auditing (e.g. an admin "verify balance
 * integrity" tool), independent of the cached User.balance field.
 */
export async function reconcileBalance(userId: mongoose.Types.ObjectId | string) {
  const [result] = await LedgerEntry.aggregate<{ credits: number; debits: number }>([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        credits: {
          $sum: { $cond: [{ $eq: ["$direction", "CREDIT"] }, "$amount", 0] },
        },
        debits: {
          $sum: { $cond: [{ $eq: ["$direction", "DEBIT"] }, "$amount", 0] },
        },
      },
    },
  ]);

  const computedBalance = result ? Math.round((result.credits - result.debits) * 100) / 100 : 0;
  const user = await User.findById(userId).select("balance").lean();

  return {
    computedBalance,
    cachedBalance: user?.balance ?? 0,
    inSync: user ? computedBalance === user.balance : false,
  };
}
