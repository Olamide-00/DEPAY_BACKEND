import ServiceFeeConfig, {
  type FeeCategory,
} from "../../models/serviceFeeConfig.js";

export interface FeeCalculationResult {
  fee: number;
  category: FeeCategory | null; // informational — which category matched, for logging/debugging
  feeConfigApplied: boolean; // false when no config row exists / disabled — informational only
}

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

function classify(serviceID: string): FeeCategory | null {
  const match = CATEGORY_PATTERNS.find((c) => c.pattern.test(serviceID));
  return match?.category ?? null;
}

export async function calculateFee(
  serviceID: string | undefined,
  faceValue: number,
): Promise<FeeCalculationResult> {
  if (!serviceID || !faceValue || faceValue <= 0) {
    return { fee: 0, category: null, feeConfigApplied: false };
  }

  const category = classify(serviceID.toLowerCase().trim());
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

  return { fee: Math.round(fee * 100) / 100, category, feeConfigApplied: true };
}
