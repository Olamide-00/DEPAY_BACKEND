import ServiceFeeConfig from "../../models/serviceFeeConfig.js";

export interface FeeCalculationResult {
  fee: number;
  feeConfigApplied: boolean; // false when no config row exists / disabled — informational only
}

export async function calculateFee(
  serviceID: string | undefined,
  faceValue: number,
): Promise<FeeCalculationResult> {
  if (!serviceID || !faceValue || faceValue <= 0) {
    return { fee: 0, feeConfigApplied: false };
  }

  const config = await ServiceFeeConfig.findOne({
    serviceID: serviceID.toLowerCase().trim(),
    isEnabled: true,
  }).lean();

  if (!config) {
    return { fee: 0, feeConfigApplied: false };
  }

  let fee =
    config.feeType === "flat"
      ? config.feeValue
      : (faceValue * config.feeValue) / 100;

  if (config.minFee != null) fee = Math.max(fee, config.minFee);
  if (config.maxFee != null) fee = Math.min(fee, config.maxFee);

  return { fee: Math.round(fee * 100) / 100, feeConfigApplied: true };
}
