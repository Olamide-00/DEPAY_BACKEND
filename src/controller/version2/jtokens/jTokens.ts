import type { Request, Response } from "express";
import User from "../../../models/users.js";
import { creditWallet } from "../../../service/ledger/ledgerService.js";
import { v4 as uuidv4 } from "uuid";

export const convertJTokens = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { amount, idempotencyKey } = req.body;
    // Trust the authenticated session, not a client-supplied email —
    // this route is mounted behind verifyToken (see app.js). Without
    // this, anyone could convert JTokens out of anyone else's account
    // just by naming their email in the request body.
    const email: string | undefined = (req.user?.email || req.body.email)?.toLowerCase().trim();

    if (!email || !amount) {
      return res.status(400).json({ message: "Email and amount are required" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentTokens = user.jTokens ?? 0;

    if (currentTokens <= 0) {
      return res
        .status(400)
        .json({ message: "You have no JTokens to convert" });
    }

    if (numericAmount > currentTokens) {
      return res.status(400).json({
        message: `Insufficient JTokens. You have ${currentTokens} JTokens available`,
      });
    }

    // Conditional deduction guarded by jTokens >= numericAmount at the
    // moment of write — the previous version read `currentTokens`
    // separately and then blindly $inc'd, so two concurrent
    // conversions could both pass the check above and both deduct,
    // pushing jTokens negative (Mongoose schema `min: 0` does not get
    // enforced on `$inc` updates). This filter closes that race the
    // same way the ledger's own debitWallet does for naira balance.
    const updatedUser = await User.findOneAndUpdate(
      { email, jTokens: { $gte: numericAmount } },
      { $inc: { jTokens: -numericAmount } },
      { new: true },
    );

    if (!updatedUser) {
      return res.status(409).json({
        message: "JToken balance changed — please try again",
      });
    }

    // 1 JToken = ₦1 — credit the naira equivalent through the ledger
    // so the conversion is tracked, atomic with the balance update,
    // and idempotent against retries.
    const reference = `JTK-${idempotencyKey || uuidv4()}`;
    let creditResult: Awaited<ReturnType<typeof creditWallet>>;
    try {
      creditResult = await creditWallet({
        userId: user._id,
        amount: numericAmount,
        category: "JTOKEN_CONVERSION",
        reference,
        description: `${numericAmount} JTokens converted to naira`,
        performedBy: "USER",
        metadata: { jTokensConverted: numericAmount },
      });
    } catch (creditError) {
      // Give the tokens back — the wallet credit didn't land, so the
      // deduction above must not stick either.
      await User.updateOne({ _id: user._id }, { $inc: { jTokens: numericAmount } });
      throw creditError;
    }

    console.log(
      `[convertJTokens] ${email} converted ${numericAmount} JTokens → ₦${numericAmount} | Remaining tokens: ${updatedUser.jTokens}`,
    );

    return res.status(200).json({
      message: "JTokens converted successfully",
      converted: numericAmount,
      nairaAdded: numericAmount,
      remainingTokens: updatedUser.jTokens,
      newBalance: creditResult.balance,
      user: {
        balance: creditResult.balance,
        jTokens: updatedUser.jTokens,
      },
    });
  } catch (error) {
    console.error("[convertJTokens] Error:", error instanceof Error ? error.message : error);
    return res.status(500).json({
      message: "Server error during JToken conversion",
      error: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
    });
  }
};
