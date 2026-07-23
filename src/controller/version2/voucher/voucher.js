import User from "../../../models/users.js";
import Voucher from "../../../models/voucher.js";
import { generateUniqueVoucherCode } from "../../../utils/version2/voucher.js";

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 50000;

// ─── Create Voucher ───────────────────────────────────────────
export const createVoucher = async (req, res) => {
  try {
    const { amount } = req.body;
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

    if (user.balance < numericAmount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Generate and immediately normalize the code to Uppercase
    const rawCode = await generateUniqueVoucherCode();
    const normalizedCode = rawCode.toUpperCase().trim();

    // Deduct balance atomically
    const updatedUser = await User.findOneAndUpdate(
      {
        email,
        balance: { $gte: numericAmount },
      },
      { $inc: { balance: -numericAmount } },
      { new: true },
    );

    if (!updatedUser) {
      return res
        .status(400)
        .json({ message: "Insufficient balance or update failed" });
    }

    const voucher = await Voucher.create({
      code: normalizedCode, // Saved as Uppercase
      amount: numericAmount,
      createdBy: user._id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    console.log(`[createVoucher] ${email} created voucher ${normalizedCode}`);

    return res.status(201).json({
      message: "Voucher created successfully",
      voucherCode: voucher.code,
      amount: voucher.amount,
      expiresAt: voucher.expiresAt,
      user: { balance: updatedUser.balance },
    });
  } catch (error) {
    console.error("[createVoucher] Error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error during voucher creation" });
  }
};

// ─── Redeem Voucher ───────────────────────────────────────────
export const redeemVoucher = async (req, res) => {
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

    // Atomically update voucher and credit user
    const [updatedVoucher, updatedUser] = await Promise.all([
      Voucher.findByIdAndUpdate(
        voucher._id,
        {
          status: "redeemed",
          redeemedBy: user._id,
          redeemedAt: new Date(),
        },
        { new: true },
      ),
      User.findOneAndUpdate(
        { email },
        { $inc: { balance: voucher.amount } },
        { new: true },
      ),
    ]);

    return res.status(200).json({
      message: "Voucher redeemed successfully",
      amount: voucher.amount,
      user: { balance: updatedUser.balance },
    });
  } catch (error) {
    console.error("[redeemVoucher] Error:", error.message);
    return res.status(500).json({ message: "Server error during redemption" });
  }
};

// ─── Check Voucher ────────────────────────────────────────────
export const checkVoucher = async (req, res) => {
  try {
    // Handling both query (GET) or body (POST/PUT) just in case
    const code = req.query.code || req.body.code;

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
    console.error("[checkVoucher] Error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error during voucher check" });
  }
};
