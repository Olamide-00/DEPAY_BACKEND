import ServiceFeeConfig, {
  type FeeCategory,
} from "../../models/serviceFeeConfig.js";

export interface FeeCalculationResult {
  fee: number;
  category: FeeCategory | null;
  feeConfigApplied: boolean;
}

export interface FeeQuote extends FeeCalculationResult {
  amount: number;
  total: number;
}

export class FeeMismatchError extends Error {
  quote: FeeQuote;

  constructor(quote: FeeQuote) {
    super("The service charge has changed. Please review the new total.");
    this.name = "FeeMismatchError";
    this.quote = quote;
  }
}

const EXACT_SERVICE_IDS: Record<string, FeeCategory> = {
  mtn: "airtime",
  airtel: "airtime",
  glo: "airtime",
  etisalat: "airtime",
  "9mobile": "airtime",
  showmax: "tv",
  "smile-direct": "data",
  spectranet: "data",
};

const CATEGORY_PATTERNS: { category: FeeCategory; pattern: RegExp }[] = [
  { category: "airtime", pattern: /airtime/i },
  { category: "data", pattern: /data/i },
  { category: "tv", pattern: /tv|cable|dstv|gotv|startimes/i },
  {
    category: "electricity",
    pattern:
      /electric|disco|prepaid|postpaid|ikedc|ekedc|aedc|phed|kedco|ibedc/i,
  },
  { category: "education", pattern: /waec|neco|jamb|education/i },
];

export function classifyServiceID(serviceID: string): FeeCategory | null {
  const id = serviceID.toLowerCase().trim();
  const exact = EXACT_SERVICE_IDS[id];
  if (exact) return exact;
  return CATEGORY_PATTERNS.find((c) => c.pattern.test(id))?.category ?? null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export async function calculateFee(
  serviceID: string | undefined,
  faceValue: number,
): Promise<FeeCalculationResult> {
  if (!serviceID || !Number.isFinite(faceValue) || faceValue <= 0) {
    return { fee: 0, category: null, feeConfigApplied: false };
  }

  const category = classifyServiceID(serviceID);
  if (!category) {
    return { fee: 0, category: null, feeConfigApplied: false };
  }

  const config = await ServiceFeeConfig.findOne({
    category,
    isEnabled: true,
  }).lean();

  if (!config) {
    return { fee: 0, category, feeConfigApplied: false };
  }

  let fee =
    config.feeType === "flat"
      ? config.feeValue
      : (faceValue * config.feeValue) / 100;

  if (config.minFee != null) fee = Math.max(fee, config.minFee);
  if (config.maxFee != null) fee = Math.min(fee, config.maxFee);

  return { fee: round2(fee), category, feeConfigApplied: true };
}

export async function getFeeQuote(
  serviceID: string | undefined,
  amount: number,
): Promise<FeeQuote> {
  const result = await calculateFee(serviceID, amount);
  return {
    ...result,
    amount: round2(amount),
    total: round2(amount + result.fee),
  };
}
