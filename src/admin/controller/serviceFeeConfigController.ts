import type { Request, Response } from "express";
import ServiceFeeConfig, {
  FEE_CATEGORIES,
  type FeeCategory,
  type FeeType,
} from "../../models/serviceFeeConfig.js";

interface UpsertFeeBody {
  feeType?: FeeType;
  feeValue?: number;
  minFee?: number | null;
  maxFee?: number | null;
  isEnabled?: boolean;
}

function isValidCategory(value: string): value is FeeCategory {
  return (FEE_CATEGORIES as readonly string[]).includes(value);
}

// GET /api/v1/admin/settings/fees
export const listFeeConfigs = async (
  _req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const configs = await ServiceFeeConfig.find().sort({ category: 1 });
    return res.status(200).json({ success: true, data: configs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[listFeeConfigs] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};

export const upsertFeeConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { category } = req.params;
    const body = req.body as UpsertFeeBody;

    if (!category || !isValidCategory(category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${FEE_CATEGORIES.join(", ")}`,
      });
    }

    const feeType = body.feeType ?? "flat";
    const feeValue = Number(body.feeValue);

    if (!Number.isFinite(feeValue) || feeValue < 0) {
      return res.status(400).json({
        success: false,
        message: "feeValue must be a non-negative number",
      });
    }
    if (feeType !== "flat" && feeType !== "percentage") {
      return res.status(400).json({
        success: false,
        message: "feeType must be 'flat' or 'percentage'",
      });
    }

    const update = {
      category,
      feeType,
      feeValue,
      minFee: body.minFee ?? null,
      maxFee: body.maxFee ?? null,
      isEnabled: body.isEnabled ?? true,
      updatedByAdminId: req.admin?.id ?? null,
    };

    const config = await ServiceFeeConfig.findOneAndUpdate(
      { category },
      { $set: update },
      { new: true, upsert: true, runValidators: true },
    );

    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[upsertFeeConfig] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};

// PATCH /api/v1/admin/settings/fees/:category/toggle
export const toggleFeeConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { category } = req.params;
    const { isEnabled } = req.body as { isEnabled?: boolean };

    if (!category || !isValidCategory(category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${FEE_CATEGORIES.join(", ")}`,
      });
    }
    if (typeof isEnabled !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "isEnabled must be a boolean" });
    }

    const config = await ServiceFeeConfig.findOneAndUpdate(
      { category },
      { $set: { isEnabled, updatedByAdminId: req.admin?.id ?? null } },
      { new: true },
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "No fee config found for this category",
      });
    }

    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[toggleFeeConfig] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};

// DELETE /api/v1/admin/settings/fees/:category
export const deleteFeeConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { category } = req.params;

    if (!category || !isValidCategory(category)) {
      return res.status(400).json({
        success: false,
        message: `category must be one of: ${FEE_CATEGORIES.join(", ")}`,
      });
    }

    const result = await ServiceFeeConfig.findOneAndDelete({ category });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "No fee config found for this category",
      });
    }

    return res
      .status(200)
      .json({ success: true, message: "Fee config deleted" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[deleteFeeConfig] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};
