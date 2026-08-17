import type { Request, Response } from "express";
import User from "../../../models/users.js";
import Voucher from "../../../models/voucher.js";
import { generateUniqueVoucherCode } from "../../../utils/version2/voucher.js";
import {
  debitWallet,
  creditWallet,
  InsufficientBalanceError,
} from "../../../service/ledger/ledgerService.js";

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 50000;

// ─── Create Voucher ───────────────────────────────────────────
export const createVoucher = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { amount } = req.body;
    // Trust the authenticated session, not a client-supplied email —
    // this route is mounted behind verifyToken (see app.js).
    const email = (req.user?.email || req.body.email)?.toLowerCase().trim();

    if (!email || !amount) {
      return res.status(400).json({ message: "Email and amount are required" });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    if (numericAmount < MIN_AMOUNT || numericAmount > MAX_AMOUNT) {
      return res.status(400).json({
        message: `Voucher amount must be between ₦${MIN_AMOUNT.toLocaleString()} and ₦${MAX_AMOUNT.toLocaleString()}`,
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate and immediately normalize the code to Uppercase
    const rawCode = await generateUniqueVoucherCode();
    const normalizedCode = rawCode.toUpperCase().trim();

    // Create the voucher document first (status "active", not yet
    // paid for) so we have a stable _id to key the ledger reference
    // on — then debit atomically. If the debit fails (insufficient
    // balance), delete the unpaid voucher so it never becomes
    // redeemable.
    const voucher = await Voucher.create({
      code: normalizedCode,
      amount: numericAmount,
      createdBy: user._id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    let debitResult: Awaited<ReturnType<typeof debitWallet>>;
    try {
      debitResult = await debitWallet({
        userId: user._id,
        amount: numericAmount,
        category: "VOUCHER_PURCHASE",
        reference: `VCH-${voucher._id}`,
        description: `Voucher ${normalizedCode} purchased`,
        performedBy: "USER",
        relatedModel: "Voucher",
        relatedId: voucher._id,
      });
    } catch (error) {
      await Voucher.deleteOne({ _id: voucher._id });
      if (error instanceof InsufficientBalanceError) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      throw error;
    }

    console.log(`[createVoucher] ${email} created voucher ${normalizedCode}`);

    return res.status(201).json({
      message: "Voucher created successfully",
      voucherCode: voucher.code,
      amount: voucher.amount,
      expiresAt: voucher.expiresAt,
      user: { balance: debitResult.balance },
    });
  } catch (error) {
    console.error("[createVoucher] Error:", (error instanceof Error ? error.message : String(error)));
    return res
      .status(500)
      .json({ message: "Server error during voucher creation" });
  }
};

// ─── Redeem Voucher ───────────────────────────────────────────
export const redeemVoucher = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { code } = req.body;
    const email = (req.user?.email || req.body.email)?.toLowerCase().trim();

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email and voucher code are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Normalize input code to match the database
    const normalizedCode = code.toUpperCase().trim();
    const voucher = await Voucher.findOne({ code: normalizedCode });

    if (!voucher) {
      return res.status(404).json({ message: "Invalid voucher code" });
    }

    if (voucher.status === "redeemed") {
      return res
        .status(400)
        .json({ message: "This voucher has already been redeemed" });
    }

    if (voucher.status === "expired" || new Date() > voucher.expiresAt) {
      await Voucher.findByIdAndUpdate(voucher._id, { status: "expired" });
      return res.status(400).json({ message: "This voucher has expired" });
    }

    if (voucher.createdBy.toString() === user._id.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot redeem your own voucher" });
    }

    // Claim the voucher FIRST, conditionally on it still being
    // "active" — this is the fix for a real double-redeem race: the
    // previous version checked `voucher.status === "redeemed"` and
    // then, separately and unconditionally, set status to "redeemed"
    // and credited the wallet. Two concurrent redeem requests for the
    // same code could both pass the check before either write landed,
    // and both would credit a wallet from a single-use voucher. This
    // conditional update can only succeed for exactly one request.
    const claimedVoucher = await Voucher.findOneAndUpdate(
      { _id: voucher._id, status: "active" },
      { status: "redeemed", redeemedBy: user._id, redeemedAt: new Date() },
      { new: true }
    );

    if (!claimedVoucher) {
      return res
        .status(409)
        .json({ message: "This voucher was just redeemed — please try another" });
    }

    let creditResult: Awaited<ReturnType<typeof creditWallet>>;
    try {
      creditResult = await creditWallet({
        userId: user._id,
        amount: voucher.amount,
        category: "VOUCHER_REDEMPTION",
        reference: `VCHR-${voucher._id}`,
        description: `Voucher ${normalizedCode} redeemed`,
        performedBy: "USER",
        relatedModel: "Voucher",
        relatedId: voucher._id,
      });
    } catch (creditError) {
      // The voucher is claimed but the credit failed — release the
      // claim so it isn't permanently stuck redeemed-but-unpaid.
      await Voucher.findByIdAndUpdate(voucher._id, {
        status: "active",
        redeemedBy: null,
        redeemedAt: null,
      });
      throw creditError;
    }

    return res.status(200).json({
      message: "Voucher redeemed successfully",
      amount: voucher.amount,
      user: { balance: creditResult.balance },
    });
  } catch (error) {
    console.error("[redeemVoucher] Error:", (error instanceof Error ? error.message : String(error)));
    return res.status(500).json({ message: "Server error during redemption" });
  }
};

// ─── Check Voucher ────────────────────────────────────────────
export const checkVoucher = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Handling both query (GET) or body (POST/PUT) just in case
    const code = (req.query.code || req.body.code) as string | undefined;

    if (!code) {
      return res.status(400).json({ message: "Voucher code is required" });
    }

    const normalizedCode = code.toUpperCase().trim();
    const voucher = await Voucher.findOne({ code: normalizedCode });

    if (!voucher) {
      return res.status(404).json({
        valid: false,
        message: "Invalid voucher code",
      });
    }

    if (voucher.status === "redeemed") {
      return res.status(200).json({
        valid: false,
        status: "redeemed",
        message: "This voucher has already been redeemed",
      });
    }

    if (voucher.status === "expired" || new Date() > voucher.expiresAt) {
      if (voucher.status !== "expired") {
        await Voucher.findByIdAndUpdate(voucher._id, { status: "expired" });
      }
      return res.status(200).json({
        valid: false,
        status: "expired",
        message: "This voucher has expired",
      });
    }

    return res.status(200).json({
      valid: true,
      status: "active",
      amount: voucher.amount,
      expiresAt: voucher.expiresAt,
      message: "Voucher is valid",
    });
  } catch (error) {
    console.error("[checkVoucher] Error:", (error instanceof Error ? error.message : String(error)));
    return res
      .status(500)
      .json({ message: "Server error during voucher check" });
  }
};
