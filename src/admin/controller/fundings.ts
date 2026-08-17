import type { Request, Response } from "express";
import Funding from "../../models/funding.js";
import User from "../../models/users.js";

const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

// ══════════════════════════════════════════════════════
// GET /api/admin/fundings
// Query: search, channel, range, page, limit
// ══════════════════════════════════════════════════════

export const getFundings = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const {
      search = "",
      channel = "all",
      range = "90d",
      page = 1,
      limit = 12,
    } = req.query as Record<string, string>;

    const match: Record<string, unknown> = {};

    if (channel !== "all") {
      match.card_type = channel;
    }

    if (range !== "all" && RANGE_MS[range]) {
      match.date = { $gte: new Date(Date.now() - RANGE_MS[range]) };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    if (search.trim()) {
      const term = search.trim();
      pipeline.push({
        $match: {
          $or: [
            { "user.fullName": { $regex: term, $options: "i" } },
            { "user.email": { $regex: term, $options: "i" } },
            { sender_name: { $regex: term, $options: "i" } },
            { reference: { $regex: term, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push(
      { $sort: { date: -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: Number(limit) },
            {
              $project: {
                _id: 1,
                userId: 1,
                userName: { $ifNull: ["$user.fullName", "—"] },
                userEmail: { $ifNull: ["$user.email", "—"] },
                senderName: "$sender_name",
                channel: "$card_type",
                amount: 1,
                fee: 1,
                reference: 1,
                date: 1,
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      }
    );

    const [result] = await Funding.aggregate(pipeline);
    const data = result?.data ?? [];
    const total = result?.total?.[0]?.count ?? 0;

    res.json({
      success: true,
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get fundings error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch fundings" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/fundings/stats
// Query: range (default 90d)
// ══════════════════════════════════════════════════════

export const getFundingStats = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { range = "90d" } = req.query as Record<string, string>;
    const match: Record<string, unknown> = {};
    if (range !== "all" && RANGE_MS[range]) {
      match.date = { $gte: new Date(Date.now() - RANGE_MS[range]) };
    }

    const [totals, channels, walletTotal] = await Promise.all([
      Funding.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalFunded: { $sum: "$amount" },
            feesEarned: { $sum: "$fee" },
            count: { $sum: 1 },
          },
        },
      ]),
      Funding.distinct("card_type", match),
      User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]),
    ]);

    res.json({
      success: true,
      data: {
        totalFunded: totals[0]?.totalFunded ?? 0,
        feesEarned: totals[0]?.feesEarned ?? 0,
        count: totals[0]?.count ?? 0,
        channels,
        walletsBalance: walletTotal[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("Get funding stats error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch funding stats" });
  }
};