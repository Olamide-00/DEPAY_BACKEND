import type { Request, Response } from "express";
import User from "../../models/users.js";
import History from "../../models/history.js";
import Funding from "../../models/funding.js";

const getDateRange = (period: string): { from: Date; to: Date } => {
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

export const getUserStats = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const [totalUserFunds, usersCount, totalSales] = await Promise.all([
      User.aggregate([{ $group: { _id: null, total: { $sum: "$balance" } } }]),
      User.countDocuments(),
      History.aggregate([
        { $match: { status: "SUCCESS", type: "DEBIT" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        usersFunds: totalUserFunds[0]?.total ?? 0,
        usersCount,
        totalSales: totalSales[0]?.total ?? 0,
      },
    });
  } catch (error) {
    console.error("User stats error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch user stats" });
  }
};

export const getUserChart = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { period = "7days" } = req.query;
    const { from, to } = getDateRange(String(period));

    const data = await User.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, day: "$_id", value: "$count" } },
    ]);

    res.json({ success: true, data });
  } catch (error) {
    console.error("User chart error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch chart data" });
  }
};

export const getSignupSources = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const data = await User.aggregate([
      { $group: { _id: "$gender", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, label: "$_id", value: "$count" } },
    ]);

    const total = data.reduce((sum, d) => sum + d.value, 0);
    const withPct = data.map((d) => ({
      ...d,
      pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
    }));

    res.json({ success: true, data: withPct, total });
  } catch (error) {
    console.error("Signup sources error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch signup sources" });
  }
};

export const getUsers = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      filter = "all",
      sort = "joined",
    } = req.query as Record<string, string>;
    const skip = (Number(page) - 1) * Number(limit);

    const matchFilter: Record<string, unknown> = {};
    if (filter === "banned") matchFilter.isActivated = false;
    if (filter === "active") matchFilter.isActivated = true;

    if (search.trim()) {
      matchFilter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      joined: { createdAt: -1 },
      balance: { balance: -1 },
      name: { fullName: 1 },
    };

    const [users, total] = await Promise.all([
      User.find(matchFilter)
        .select(
          "fullName email balance phoneNumber isEmailVerified isActivated isWalletCreated accountNumber bankName profilePicture createdAt",
        )
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(matchFilter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

export const getUserById = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select(
        "-password -transactionPIN -otp -otpExpires -loginAttempts -lockUntil -bvn -nin",
      )
      .lean();

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const [txSummary, fundingSummary] = await Promise.all([
      History.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),
      Funding.aggregate([
        { $match: { userId: user._id } },
        {
          $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        ...user,
        txSummary,
        totalFunded: fundingSummary[0]?.total ?? 0,
        fundingCount: fundingSummary[0]?.count ?? 0,
      },
    });
  } catch (error) {
    console.error("Get user by id error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};

export const toggleBanUser = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { banned } = req.body;

    if (typeof banned !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "'banned' must be a boolean" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isActivated: !banned },
      { new: true, select: "fullName email isActivated" },
    );

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({
      success: true,
      message: banned
        ? "User banned successfully"
        : "User unbanned successfully",
      data: user,
    });
  } catch (error) {
    console.error("Ban user error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update ban status" });
  }
};

export const createUser = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { fullName, email, phoneNumber } = req.body;

    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists)
      return res
        .status(409)
        .json({ success: false, message: "Email already in use" });

    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      isEmailVerified: true,
      isActivated: true,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ success: false, message: "Failed to create user" });
  }
};

export const exportUsers = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { filter = "all" } = req.query as Record<string, string>;

    const matchFilter: Record<string, unknown> = {};
    if (filter === "banned") matchFilter.isActivated = false;
    if (filter === "active") matchFilter.isActivated = true;

    const users = await User.find(matchFilter)
      .select(
        "fullName email balance phoneNumber isEmailVerified isActivated accountNumber bankName createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: users, total: users.length });
  } catch (error) {
    console.error("Export users error:", error);
    res.status(500).json({ success: false, message: "Failed to export users" });
  }
};

// ---------------------delete user ----------------------------
export const deleteUser = async (req: Request, res: Response): Promise<Response | void> => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "User ID is required",
    });
  }

  try {
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User deleted successfully",
      deletedUser: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    // Handle invalid ObjectId format
    if (error instanceof Error && error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error while deleting user",
    });
  }
};
