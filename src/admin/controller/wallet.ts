import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import User from "../../models/users.js";
import Funding from "../../models/funding.js";
import { creditWallet, getStatement } from "../../service/ledger/ledgerService.js";

// ══════════════════════════════════════════════════════
// POST /api/admin/users/:id/fund
// Body: { amount: number, idempotencyKey?: string }
//
// idempotencyKey should be generated once client-side per submit
// attempt (e.g. a UUID created when the "Credit wallet" button is
// first clicked) and re-sent unchanged on any retry. This makes a
// double-click or a network-timeout retry a no-op instead of a
// double credit — enforced by the ledger's unique reference index,
// not just a client-side disable-button check.
// ══════════════════════════════════════════════════════

export const fundUserWallet = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { amount, idempotencyKey } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be a positive number" });
    }

    const user = await User.findById(id).select("fullName email balance");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const reference = `ADM-${idempotencyKey || uuidv4()}`;

    const { balance: newBalance, duplicate } = await creditWallet({
      userId: user._id,
      amount: amt,
      category: "ADMIN_CREDIT",
      reference,
      description: `Admin wallet credit by ${req.admin!.email}`,
      performedBy: "ADMIN",
      performedByAdminId: req.admin!.id,
      relatedModel: "Funding",
    });

    if (duplicate) {
      const existingFunding = await Funding.findOne({ reference });
      return res.status(200).json({
        success: true,
        message: "Already processed (duplicate request ignored)",
        data: existingFunding,
        newBalance,
      });
    }

    // Mirror into Funding so it shows up in the existing admin
    // funding-history views. The ledger entry above is the source of
    // truth; this is a best-effort, backward-compatible mirror.
    let funding = null;
    try {
      funding = await Funding.create({
        userId: user._id,
        amount: amt,
        card_type: "Admin",
        sender_name: req.admin!.email,
        reference,
      });
    } catch (err) {
      if ((err as { code?: number })?.code !== 11000) throw err;
      funding = await Funding.findOne({ reference });
    }

    res.status(201).json({
      success: true,
      message: `Wallet credited with ₦${amt.toLocaleString()}`,
      data: funding,
      newBalance,
    });
  } catch (error) {
    console.error("Fund wallet error:", error);
    res.status(500).json({ success: false, message: "Failed to fund wallet" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/users/:id/ledger
// Query: page, limit, category
//
// The full, immutable wallet statement for a user — every credit and
// debit that ever touched their balance, in order, with a running
// balance snapshot on each row. This is the "easy to track any
// issue" view the ledger exists for.
// ══════════════════════════════════════════════════════

export const getUserLedger = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const id = String(req.params.id);
    const { page = 1, limit = 20, category } = req.query as { page?: string; limit?: string; category?: string };

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const user = await User.findById(id).select("fullName email balance");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const { entries, pagination } = await getStatement(id, {
      page: Number(page),
      limit: Number(limit),
      category: (category as import("../../models/ledgerEntry.js").LedgerCategory | undefined) ?? null,
    });

    res.json({
      success: true,
      data: entries,
      pagination,
      currentBalance: user.balance,
    });
  } catch (error) {
    console.error("Get user ledger error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch ledger" });
  }
};
