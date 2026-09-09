import type { Request, Response } from "express";
import History from "../../models/history.js";

interface ProfitQuery {
  from?: string;
  to?: string;
  serviceID?: string;
}

export const getProfitSummary = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { from, to, serviceID } = req.query as ProfitQuery;

    const match: Record<string, unknown> = { status: "SUCCESS" };

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.$gte = new Date(from);
      if (to) createdAt.$lte = new Date(to);
      match.createdAt = createdAt;
    }

    if (serviceID) {
      match.serviceID = serviceID.toLowerCase().trim();
    }

    const [byService, overall] = await Promise.all([
      History.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$serviceID",
            totalProfit: { $sum: "$profit" },
            totalRevenue: { $sum: { $add: ["$amount", "$fee"] } },
            totalFees: { $sum: "$fee" },
            totalVtpassCommission: { $sum: "$vtpassCommission" },
            transactionCount: { $sum: 1 },
          },
        },
        { $sort: { totalProfit: -1 } },
      ]),
      History.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalProfit: { $sum: "$profit" },
            totalRevenue: { $sum: { $add: ["$amount", "$fee"] } },
            totalFees: { $sum: "$fee" },
            totalVtpassCommission: { $sum: "$vtpassCommission" },
            transactionCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        overall: overall[0] ?? {
          totalProfit: 0,
          totalRevenue: 0,
          totalFees: 0,
          totalVtpassCommission: 0,
          transactionCount: 0,
        },
        byService,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[getProfitSummary] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};

// GET /api/v1/admin/analytics/profit/timeseries?from=&to=&interval=day
// Daily (or monthly) profit trend — what the dashboard chart plots.
export const getProfitTimeseries = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { from, to, serviceID } = req.query as ProfitQuery;
    const interval =
      (req.query.interval as string) === "month" ? "%Y-%m" : "%Y-%m-%d";

    const match: Record<string, unknown> = { status: "SUCCESS" };

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.$gte = new Date(from);
      if (to) createdAt.$lte = new Date(to);
      match.createdAt = createdAt;
    }

    if (serviceID) {
      match.serviceID = serviceID.toLowerCase().trim();
    }

    const series = await History.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: interval, date: "$createdAt" } },
          totalProfit: { $sum: "$profit" },
          transactionCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return res.status(200).json({ success: true, data: series });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[getProfitTimeseries] Error:", message);
    return res.status(500).json({ success: false, message });
  }
};
