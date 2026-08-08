import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import User from "../../models/users.js";
import Funding from "../../models/funding.js";
import History from "../../models/history.js";

// ══════════════════════════════════════════════════════
// POST /api/admin/users/:id/fund
// Body: { amount: number, idempotencyKey?: string }
//
// idempotencyKey should be generated once client-side per submit
// attempt (e.g. a UUID created when the "Credit wallet" button is
// first clicked) and re-sent unchanged on any retry. This makes a
// double-click or a network-timeout retry a no-op instead of a
// double credit — enforced here via a unique index on
// Funding.reference, not just a client-side disable-button check.
// ══════════════════════════════════════════════════════

export const fundUserWallet = async (req, res) => {
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

    // Try to create the Funding record first — the unique index on
    // `reference` is what actually enforces idempotency, not app logic.
    let funding;
    try {
      funding = await Funding.create({
        userId: user._id,
        amount: amt,
        card_type: "Admin",
        sender_name: req.admin.email,
        reference,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate reference = this exact request already succeeded.
        const existing = await Funding.findOne({ reference });
        const current = await User.findById(id).select("balance");
        return res.status(200).json({
          success: true,
          message: "Already processed (duplicate request ignored)",
          data: existing,
          newBalance: current.balance,
        });
      }
      throw err;
    }

    // Atomic increment — safe under concurrent requests.
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $inc: { balance: amt } },
      { new: true, select: "balance" }
    );

    // Mirror into History so it shows up in the user's transaction
    // history tab alongside bill payments, consistent with how the
    // dashboard UI expects a unified-looking timeline per user.
    await History.create({
      userId: user._id,
      service: "Admin Wallet Credit",
      amount: amt,
      transactionReference: reference,
      type: "CREDIT",
      status: "SUCCESS",
      name: user.fullName,
    });

    res.status(201).json({
      success: true,
      message: `Wallet credited with ₦${amt.toLocaleString()}`,
      data: funding,
      newBalance: updatedUser.balance,
    });
  } catch (error) {
    console.error("Fund wallet error:", error);
    res.status(500).json({ success: false, message: "Failed to fund wallet" });
  }
};