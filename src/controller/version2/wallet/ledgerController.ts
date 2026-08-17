import type { Request, Response } from "express";
import User from "../../../models/users.js";
import { getStatement } from "../../../service/ledger/ledgerService.js";
import type { LedgerCategory } from "../../../models/ledgerEntry.js";

// ══════════════════════════════════════════════════════════════════
// GET /api/v1/wallet/ledger
// Query: page, limit, category
//
// Self-service equivalent of the admin ledger view — a user's own
// wallet statement, always scoped to req.user (never a client-
// supplied id), so there's no way to read someone else's ledger.
// ══════════════════════════════════════════════════════════════════

export const getMyLedger = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { page = 1, limit = 20, category } = req.query;

    const user = await User.findOne({ email: req.user?.email }).select("balance");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { entries, pagination } = await getStatement(user._id, {
      page: Number(page),
      limit: Number(limit),
      category: (category as LedgerCategory | undefined) ?? null,
    });

    return res.status(200).json({
      data: entries,
      pagination,
      currentBalance: user.balance,
    });
  } catch (error) {
    console.error("[getMyLedger] Error:", error instanceof Error ? error.message : error);
    return res.status(500).json({ message: "Failed to fetch wallet statement" });
  }
};
