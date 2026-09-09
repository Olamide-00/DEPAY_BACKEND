import type { Request, Response } from "express";
import ServiceFeeConfig, {
  type FeeType,
} from "../../models/serviceFeeConfig.js";

interface UpsertFeeBody {
  serviceID?: string;
  feeType?: FeeType;
  feeValue?: number;
  minFee?: number | null;
  maxFee?: number | null;
  isEnabled?: boolean;
}

// GET /api/v1/admin/settings/fees
export const listFeeConfigs = async (
  _req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const configs = await ServiceFeeConfig.find().sort({ serviceID: 1 });
    return res.status(200).json({ success: true, data: configs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[listFeeConfigs] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};

// PUT /api/v1/admin/settings/fees/:serviceID
// Upsert — admin can create a new config or update an existing one
// from the same form. `serviceID` in the URL is the source of
// truth; any serviceID in the body is ignored to avoid a mismatch
// between the two.
export const upsertFeeConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { serviceID } = req.params;
    const body = req.body as UpsertFeeBody;

    if (!serviceID) {
      return res
        .status(400)
        .json({ success: false, message: "serviceID is required" });
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
      serviceID: serviceID.toLowerCase().trim(),
      feeType,
      feeValue,
      minFee: body.minFee ?? null,
      maxFee: body.maxFee ?? null,
      isEnabled: body.isEnabled ?? true,
      updatedByAdminId: req.admin?.id ?? null,
    };

    const config = await ServiceFeeConfig.findOneAndUpdate(
      { serviceID: update.serviceID },
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

// PATCH /api/v1/admin/settings/fees/:serviceID/toggle
// Quick on/off switch — separate from the full upsert so the
// dashboard toggle UI doesn't need to resend the whole fee config
// just to flip isEnabled.
export const toggleFeeConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { serviceID } = req.params;
    const { isEnabled } = req.body as { isEnabled?: boolean };

    if (typeof isEnabled !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "isEnabled must be a boolean" });
    }

    const config = await ServiceFeeConfig.findOneAndUpdate(
      { serviceID: serviceID.toLowerCase().trim() },
      { $set: { isEnabled, updatedByAdminId: req.admin?.id ?? null } },
      { new: true },
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "No fee config found for this serviceID",
      });
    }

    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[toggleFeeConfig] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};

// DELETE /api/v1/admin/settings/fees/:serviceID
export const deleteFeeConfig = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { serviceID } = req.params;
    const result = await ServiceFeeConfig.findOneAndDelete({
      serviceID: serviceID.toLowerCase().trim(),
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "No fee config found for this serviceID",
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
