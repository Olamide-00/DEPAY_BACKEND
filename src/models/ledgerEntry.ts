import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

// ══════════════════════════════════════════════════════════════════
// LedgerEntry
//
// Every event that changes a user's wallet balance — bill payment,
// wallet funding, admin credit/debit, voucher purchase/redemption,
// JToken conversion, referral bonus, reversal — writes exactly ONE
// immutable entry here, inside the same DB transaction that updates
// User.balance. Nothing is ever updated or deleted after the fact;
// a mistake is corrected with a new, opposite entry (see `reverseDebit`
// in ledgerService.ts), never by editing history.
//
// User.balance stays as a cached, always-in-sync running total (fast
// reads for the app — no need to SUM() the ledger on every balance
// check), but the ledger is the audit trail: `balanceBefore` /
// `balanceAfter` on each row let you replay or verify a user's
// balance at any point in time, and the unique `reference` makes
// every write idempotent — a retried request (double-click, network
// timeout + retry, duplicate webhook delivery) can never double-apply.
// ══════════════════════════════════════════════════════════════════

export const LEDGER_CATEGORIES = [
  "WALLET_FUNDING", // Paystack dedicated NUBAN webhook credit
  "ADMIN_CREDIT", // Manual admin wallet credit
  "ADMIN_DEBIT", // Manual admin wallet debit
  "ADMIN_REVERSAL", // Admin reversing a failed debit back to the wallet
  "BILL_PAYMENT", // Airtime / data / TV / electricity purchase
  "BILL_REFUND", // Automatic refund when a bill payment fails
  "VOUCHER_PURCHASE", // User locks wallet funds into a voucher
  "VOUCHER_REDEMPTION", // User redeems someone else's voucher code
  "JTOKEN_CONVERSION", // JTokens converted to naira balance
  "REFERRAL_BONUS", // Bonus credited to a referrer on referee's first funding
] as const;

export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
export type LedgerDirection = "CREDIT" | "DEBIT";
export type LedgerRelatedModel = "History" | "Funding" | "Voucher" | null;
export type LedgerPerformedBy = "USER" | "ADMIN" | "SYSTEM";

export interface ILedgerEntry {
  userId: mongoose.Types.ObjectId;
  direction: LedgerDirection;
  category: LedgerCategory;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  relatedModel: LedgerRelatedModel;
  relatedId: mongoose.Types.ObjectId | null;
  description?: string;
  performedBy: LedgerPerformedBy;
  performedByAdminId: mongoose.Types.ObjectId | null;
  reversalOfReference: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type LedgerEntryDocument = HydratedDocument<ILedgerEntry>;

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: LEDGER_CATEGORIES,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    // Idempotency key. One reference == one ledger effect, ever.
    // Retrying a request with the same reference is guaranteed to be
    // a no-op (enforced by the unique index, not application logic).
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    relatedModel: {
      type: String,
      enum: ["History", "Funding", "Voucher", null],
      default: null,
    },
    relatedId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 255,
    },
    performedBy: {
      type: String,
      enum: ["USER", "ADMIN", "SYSTEM"],
      default: "SYSTEM",
    },
    performedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    // Set only on ADMIN_REVERSAL entries — points back at the
    // original DEBIT entry's reference that this entry reverses.
    reversalOfReference: {
      type: String,
      default: null,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

// Fast per-user statement queries, newest first.
ledgerEntrySchema.index({ userId: 1, createdAt: -1 });
ledgerEntrySchema.index({ userId: 1, category: 1, createdAt: -1 });

// Ledger rows are immutable — block accidental mutation from
// anywhere that isn't the ledger service itself.
ledgerEntrySchema.pre("findOneAndUpdate", function (next) {
  next(new Error("LedgerEntry rows are immutable and cannot be updated."));
});
ledgerEntrySchema.pre("updateOne", function (next) {
  next(new Error("LedgerEntry rows are immutable and cannot be updated."));
});
ledgerEntrySchema.pre("deleteOne", function (next) {
  next(new Error("LedgerEntry rows are immutable and cannot be deleted."));
});

const LedgerEntry: Model<ILedgerEntry> = mongoose.model<ILedgerEntry>(
  "LedgerEntry",
  ledgerEntrySchema,
);

export default LedgerEntry;
