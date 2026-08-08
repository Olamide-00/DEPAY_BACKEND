import mongoose from "mongoose";
import History from "../../models/history.js";
import User from "../../models/users.js";
import Service from "../models/service.js";

const RANGE_MS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// ══════════════════════════════════════════════════════
// GET /api/admin/transactions
// Query: search, type, status, range(24h|7d|30d), page, limit
//
// NOTE: this endpoint covers bill-payment transactions (History
// collection) only. Wallet deposits live in the separate Funding
// collection — see /api/admin/fundings. The dashboard UI's "type"
// dropdown treats funding as a 7th value; if you want a single
// merged list you'll need to combine both endpoints client-side
// (or ask me to add a merge layer — flagging rather than guessing).
// ══════════════════════════════════════════════════════
export const getTransactions = async (req, res) => {
  try {
    const {
      search = "",
      type = "all",
      status = "all",
      range = "all",
      page = 1,
      limit = 12,
    } = req.query;

    const match = {};

    if (status !== "all") {
      match.status = status.toUpperCase();
    }

    if (range !== "all" && RANGE_MS[range]) {
      match.createdAt = { $gte: new Date(Date.now() - RANGE_MS[range]) };
    }

    if (type !== "all") {
      const service = await Service.findOne({ key: type }).lean();
      const pattern = service ? service.matchPattern : type;
      const regex = new RegExp(pattern, "i");
      match.$or = [{ service: regex }, { serviceID: regex }];
    }

    if (search.trim()) {
      const term = search.trim();
      const searchOr = [
        { transactionReference: { $regex: term, $options: "i" } },
        { transactionNumber: { $regex: term, $options: "i" } },
        { name: { $regex: term, $options: "i" } },
      ];
      // Combine with any existing $or (from type filter) via $and
      if (match.$or) {
        match.$and = [{ $or: match.$or }, { $or: searchOr }];
        delete match.$or;
      } else {
        match.$or = searchOr;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      History.aggregate([
        { $match: match },
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
            userId: 1,
            userName: { $ifNull: ["$user.fullName", "—"] },
            userEmail: { $ifNull: ["$user.email", "—"] },
            service: 1,
            serviceID: 1,
            transactionReference: 1,
            transactionNumber: 1,
            amount: 1,
            fee: 1,
            status: 1,
            type: 1,
            token: 1,
            units: 1,
            createdAt: 1,
            reversedAt: 1,
          },
        },
      ]),
      History.countDocuments(match),
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
    console.error("Get transactions error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch transactions" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/transactions/:id
// ══════════════════════════════════════════════════════
export const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction ID" });
    }

    const tx = await History.findById(id)
      .populate("userId", "fullName email phoneNumber")
      .lean();

    if (!tx) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    res.json({ success: true, data: tx });
  } catch (error) {
    console.error("Get transaction by id error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch transaction" });
  }
};

// ══════════════════════════════════════════════════════
// PATCH /api/admin/transactions/:id/status
// Body: { status: "SUCCESS" | "FAILED" | "REVERSED" }
//
// Guarded state machine:
//   PENDING -> SUCCESS      (no wallet impact — funds were already
//                             debited at initiation, admin is just
//                             confirming the provider outcome)
//   PENDING -> FAILED       (no wallet impact — see REVERSED below
//                             for the explicit, separate refund step)
//   FAILED  -> REVERSED     (credits the user's wallet the tx amount,
//                             atomically, exactly once)
//
// REVERSED is a one-way terminal state and only reachable from
// FAILED — this is a deliberate two-step design (fail, then a
// separate manual reversal) rather than auto-refunding on FAILED,
// so a wallet credit is never a side-effect of a plain status label
// change.
// ══════════════════════════════════════════════════════
export const updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["SUCCESS", "FAILED", "REVERSED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(", ")}`,
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction ID" });
    }

    const tx = await History.findById(id);
    if (!tx) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    // ── Reversal: the only path that touches the wallet ──────
    if (status === "REVERSED") {
      if (tx.status !== "FAILED") {
        return res.status(400).json({
          success: false,
          message: "Only failed transactions can be reversed",
        });
      }
      if (tx.reversedAt) {
        return res.status(409).json({
          success: false,
          message: "This transaction has already been reversed",
        });
      }
      if (tx.type !== "DEBIT") {
        return res.status(400).json({
          success: false,
          message: "Only debit transactions can be reversed to wallet",
        });
      }

      // Atomic single-document credit — no race condition even
      // under concurrent admin actions or retries.
      const creditedUser = await User.findByIdAndUpdate(
        tx.userId,
        { $inc: { balance: tx.amount } },
        { new: true, select: "balance" }
      );

      if (!creditedUser) {
        return res.status(404).json({
          success: false,
          message: "Cannot reverse — the user on this transaction no longer exists",
        });
      }

      // Guard against a double-reversal race: only flip to REVERSED
      // if it's still FAILED and not yet reversed at update time.
      const updated = await History.findOneAndUpdate(
        { _id: id, status: "FAILED", reversedAt: null },
        {
          status: "REVERSED",
          reversedAt: new Date(),
          reversedBy: req.admin.id,
        },
        { new: true }
      );

      if (!updated) {
        // Someone else reversed it in the tiny window above — undo
        // the wallet credit we just made to avoid double-crediting.
        await User.findByIdAndUpdate(tx.userId, {
          $inc: { balance: -tx.amount },
        });
        return res.status(409).json({
          success: false,
          message: "This transaction was already reversed by another admin",
        });
      }

      return res.json({
        success: true,
        message: `Transaction reversed — ₦${tx.amount.toLocaleString()} credited to wallet`,
        data: updated,
        newBalance: creditedUser.balance,
      });
    }

    // ── SUCCESS / FAILED: label-only transitions from PENDING ──
    if (tx.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: `Cannot mark as ${status} — transaction is currently ${tx.status}`,
      });
    }

    tx.status = status;
    await tx.save();

    res.json({
      success: true,
      message: `Transaction marked as ${status.toLowerCase()}`,
      data: tx,
    });
  } catch (error) {
    console.error("Update transaction status error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update transaction" });
  }
};