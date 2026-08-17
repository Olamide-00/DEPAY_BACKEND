import type { Request, Response } from "express";
import Service, { ensureServicesSeeded } from "../models/service.js";
import History from "../../models/history.js";

// ══════════════════════════════════════════════════════
// GET /api/admin/services
// Returns the catalog with a live "orders today" count per
// service, computed from History via each service's matchPattern.
// ══════════════════════════════════════════════════════
export const getServices = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    await ensureServicesSeeded();

    const services = await Service.find().sort({ createdAt: 1 }).lean();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const withVolume = await Promise.all(
      services.map(async (s) => {
        let todayVolume = 0;
        if (s.enabled) {
          try {
            const regex = new RegExp(s.matchPattern, "i");
            todayVolume = await History.countDocuments({
              createdAt: { $gte: startOfToday },
              $or: [{ service: regex }, { serviceID: regex }],
            });
          } catch (e) {
            // A malformed matchPattern (bad admin edit) shouldn't 500 the page
            console.error(`Bad matchPattern for service ${s.key}:`, e instanceof Error ? e.message : e);
          }
        }
        return { ...s, todayVolume };
      })
    );

    res.json({ success: true, data: withVolume });
  } catch (error) {
    console.error("Get services error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch services" });
  }
};

// ══════════════════════════════════════════════════════
// PATCH /api/admin/services/:id/toggle
// Body: { enabled: boolean }
// ══════════════════════════════════════════════════════
export const toggleService = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "'enabled' must be a boolean" });
    }

    const service = await Service.findByIdAndUpdate(
      id,
      { enabled, updatedBy: req.admin!.id },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    res.json({
      success: true,
      message: `${service.name} ${enabled ? "enabled" : "disabled"}`,
      data: service,
    });
  } catch (error) {
    console.error("Toggle service error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update service" });
  }
};

// ══════════════════════════════════════════════════════
// PATCH /api/admin/services/:id/discount
// Body: { discount: number }  — 0 to 20
// ══════════════════════════════════════════════════════
export const updateDiscount = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const discount = Number(req.body.discount);

    if (Number.isNaN(discount) || discount < 0 || discount > 20) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a number between 0 and 20",
      });
    }

    const service = await Service.findByIdAndUpdate(
      id,
      { discount, updatedBy: req.admin!.id },
      { new: true, runValidators: true }
    );

    if (!service) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    res.json({
      success: true,
      message: "Discount rate updated",
      data: service,
    });
  } catch (error) {
    console.error("Update discount error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update discount" });
  }
};