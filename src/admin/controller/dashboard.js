import User from "../../models/users.js";
import History from "../../models/history.js";
import Funding from "../../models/funding.js";

// ── Helper ────────────────────────────────────────────
const getDateRange = (period) => {
  const now = new Date();
  const from = new Date();
  switch (period) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7days":
      from.setDate(now.getDate() - 7);
      break;
    case "14days":
      from.setDate(now.getDate() - 14);
      break;
    case "30days":
      from.setDate(now.getDate() - 30);
      break;
    case "all":
      from.setFullYear(2000);
      break; // all time
    default:
      from.setDate(now.getDate() - 7);
  }
  return { from, to: now };
};

// ══════════════════════════════════════════════════════
// GET /api/admin/stats
// ══════════════════════════════════════════════════════
export const getDashboardStats = async (req, res) => {
  try {
    const { period = "7days" } = req.query;
    const { from, to } = getDateRange(period);

    const [
      totalUsers,
      activeUsers,
      totalUserFunds,
      totalSales,
      totalFunding,
      newUsersInPeriod,
      salesInPeriod,
      fundingInPeriod,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActivated: true }),
      User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]),
      History.aggregate([
        { $match: { status: "SUCCESS", type: "DEBIT" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Funding.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      User.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      History.aggregate([
        {
          $match: {
            status: "SUCCESS",
            type: "DEBIT",
            createdAt: { $gte: from, $lte: to },
          },
        },
        {
          $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } },
        },
      ]),
      Funding.aggregate([
        { $match: { date: { $gte: from, $lte: to } } },
        {
          $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        period,
        usersFunds: totalUserFunds[0]?.total ?? 0,
        usersCount: totalUsers,
        activeUsersCount: activeUsers,
        totalSales: totalSales[0]?.total ?? 0,
        totalFunding: totalFunding[0]?.total ?? 0,
        newUsersInPeriod,
        salesInPeriod: {
          total: salesInPeriod[0]?.total ?? 0,
          count: salesInPeriod[0]?.count ?? 0,
        },
        fundingInPeriod: {
          total: fundingInPeriod[0]?.total ?? 0,
          count: fundingInPeriod[0]?.count ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/chart
// ══════════════════════════════════════════════════════
export const getDashboardChart = async (req, res) => {
  try {
    const { period = "7days" } = req.query;
    const { from, to } = getDateRange(period);

    const data = await History.aggregate([
      { $match: { status: "SUCCESS", createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, day: "$_id", value: "$totalAmount", count: 1 } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Dashboard chart error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch chart data" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/sales-breakdown
// ══════════════════════════════════════════════════════
export const getSalesBreakdown = async (req, res) => {
  try {
    const { period = "7days" } = req.query;
    const { from, to } = getDateRange(period);

    const data = await History.aggregate([
      {
        $match: {
          status: "SUCCESS",
          type: "DEBIT",
          createdAt: { $gte: from, $lte: to },
          service: { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$service",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
      { $project: { _id: 0, name: "$_id", value: "$total", count: 1 } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error("Sales breakdown error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch sales breakdown" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/recent-transactions
// tab=all     → History collection (all transactions)
// tab=funding → Funding collection (wallet top-ups)
// ══════════════════════════════════════════════════════
export const getRecentTransactions = async (req, res) => {
  try {
    const { limit = 10, page = 1, tab = "all", period = "7days" } = req.query;
    const { from, to } = getDateRange(period);
    const skip = (Number(page) - 1) * Number(limit);

    // ── Funding tab ───────────────────────────────────
    if (tab === "funding") {
      const matchFilter = { date: { $gte: from, $lte: to } };

      const [fundings, total] = await Promise.all([
        Funding.aggregate([
          { $match: matchFilter },
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: Number(limit) },
          {
            $lookup: {
              from: "users", // MongoDB collection name
              localField: "userId",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              email: { $ifNull: ["$user.email", "—"] },
              service: { $literal: "Funding" },
              // sender_name is who funded — used as the "recipient" column
              transactionNumber: { $ifNull: ["$sender_name", "—"] },
              amount: 1,
              card_type: 1,
              type: { $literal: "CREDIT" },
              status: { $literal: "SUCCESS" },
              createdAt: "$date",
            },
          },
        ]),
        Funding.countDocuments(matchFilter),
      ]);

      return res.json({
        success: true,
        data: fundings,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    }

    // ── All tab → History ─────────────────────────────
    const matchFilter = { createdAt: { $gte: from, $lte: to } };

    const [transactions, total] = await Promise.all([
      History.aggregate([
        { $match: matchFilter },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            email: { $ifNull: ["$user.email", "—"] },
            service: { $ifNull: ["$service", "—"] },
            transactionNumber: { $ifNull: ["$transactionNumber", "—"] },
            amount: 1,
            type: 1,
            status: 1,
            createdAt: 1,
          },
        },
      ]),
      History.countDocuments(matchFilter),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Recent transactions error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch transactions" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/earnings
// Total earnings = sum of History.amount + Funding.amount
// ══════════════════════════════════════════════════════
export const getEarnings = async (req, res) => {
  try {
    const { period = "7days" } = req.query;
    const { from, to } = getDateRange(period);

    const periodMs = to - from;
    const prevFrom = new Date(from - periodMs);
    const prevTo = new Date(from);

    const [currentHistory, currentFunding, previousHistory, previousFunding] =
      await Promise.all([
        History.aggregate([
          { $match: { createdAt: { $gte: from, $lte: to } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Funding.aggregate([
          { $match: { date: { $gte: from, $lte: to } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        History.aggregate([
          { $match: { createdAt: { $gte: prevFrom, $lte: prevTo } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        Funding.aggregate([
          { $match: { date: { $gte: prevFrom, $lte: prevTo } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

    const currentTotal =
      (currentHistory[0]?.total ?? 0) + (currentFunding[0]?.total ?? 0);
    const previousTotal =
      (previousHistory[0]?.total ?? 0) + (previousFunding[0]?.total ?? 0);

    const percentChange =
      previousTotal === 0
        ? 100
        : Math.round(((currentTotal - previousTotal) / previousTotal) * 100);

    const gaugePercent = Math.min(
      100,
      previousTotal === 0
        ? 80
        : Math.round((currentTotal / (previousTotal || 1)) * 100),
    );

    res.json({
      success: true,
      data: {
        totalEarnings: currentTotal,
        previousEarnings: previousTotal,
        percentChange,
        gaugePercent,
        trend: percentChange >= 0 ? "up" : "down",
      },
    });
  } catch (error) {
    console.error("Earnings error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch earnings" });
  }
};
