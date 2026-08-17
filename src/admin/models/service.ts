import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

// ══════════════════════════════════════════════════════
// Service & Pricing catalog — owned by the admin panel.
//
// Design note: this does NOT mirror the live VTU aggregator's raw
// service list (which is granular per-biller, e.g. "mtn-data",
// "dstv-compact", and changes shape by provider). Instead it holds
// the 6 curated customer-facing categories the dashboard displays,
// each with an admin-editable discount + enabled flag.
//
// `matchPattern` is a regex (as a string) used to compute "orders
// today" by matching against History.service / History.serviceID,
// since those fields currently hold inconsistent raw aggregator
// values rather than a clean category key. Admins can tune the
// pattern per service if the aggregator's naming changes.
// ══════════════════════════════════════════════════════

const CATEGORY_KEYS = [
  "airtime",
  "data",
  "cable",
  "electricity",
  "betting",
  "education",
] as const;

export type ServiceKey = (typeof CATEGORY_KEYS)[number];

export interface IService {
  key: ServiceKey;
  name: string;
  desc: string;
  discount: number;
  enabled: boolean;
  providers: number;
  matchPattern: string;
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceDocument = HydratedDocument<IService>;

const serviceSchema = new Schema<IService>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      enum: CATEGORY_KEYS,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    desc: { type: String, trim: true, default: "" },
    discount: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Discount cannot be negative"],
      max: [20, "Discount cannot exceed 20%"],
    },
    enabled: { type: Boolean, default: true, index: true },
    providers: { type: Number, default: 0, min: 0 },
    matchPattern: { type: String, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

const Service: Model<IService> = mongoose.model<IService>("Service", serviceSchema);

// ── Default catalog, matches the dashboard UI 1:1 ────────
export const DEFAULT_SERVICES: Array<Omit<IService, "updatedBy" | "createdAt" | "updatedAt">> = [
  {
    key: "airtime",
    name: "Airtime Top-up",
    desc: "MTN, Glo, Airtel, 9mobile VTU",
    discount: 2.5,
    enabled: true,
    providers: 4,
    matchPattern: "airtime",
  },
  {
    key: "data",
    name: "Data Bundles",
    desc: "SME & direct data across all networks",
    discount: 4.0,
    enabled: true,
    providers: 4,
    matchPattern: "data",
  },
  {
    key: "cable",
    name: "Cable TV",
    desc: "DStv, GOtv & StarTimes subscriptions",
    discount: 1.5,
    enabled: true,
    providers: 3,
    matchPattern: "tv|cable|dstv|gotv|startimes",
  },
  {
    key: "electricity",
    name: "Electricity Bills",
    desc: "Prepaid & postpaid across 11 DisCos",
    discount: 1.0,
    enabled: true,
    providers: 11,
    matchPattern:
      "electric|disco|prepaid|postpaid|ikedc|ekedc|aedc|phed|kedco|ibedc",
  },
  {
    key: "betting",
    name: "Betting Wallets",
    desc: "Fund Bet9ja, SportyBet, BetKing & more",
    discount: 0.5,
    enabled: true,
    providers: 8,
    matchPattern: "bet",
  },
  {
    key: "education",
    name: "Education Pins",
    desc: "WAEC, NECO & JAMB result checkers",
    discount: 3.0,
    enabled: false,
    providers: 3,
    matchPattern: "waec|neco|jamb|education",
  },
];

// Idempotent — safe to call on every request; only writes if the
// collection is empty, so it never overwrites admin edits.
export const ensureServicesSeeded = async (): Promise<void> => {
  const count = await Service.countDocuments();
  if (count === 0) {
    await Service.insertMany(DEFAULT_SERVICES);
  }
};

export default Service;
