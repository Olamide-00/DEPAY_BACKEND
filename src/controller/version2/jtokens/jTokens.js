import User from "../../../models/users.js";

export const convertJTokens = async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res.status(400).json({ message: "Email and amount are required" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
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

    // 1 JToken = ₦1 — deduct tokens, credit balance
    const updatedUser = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      {
        $inc: {
          balance: numericAmount, // ← credit naira equivalent
          jTokens: -numericAmount, // ← deduct exact tokens converted
        },
      },
      { new: true },
    );

    console.log(
      `[convertJTokens] ${email} converted ${numericAmount} JTokens → ₦${numericAmount} | Remaining tokens: ${updatedUser.jTokens}`,
    );

    return res.status(200).json({
      message: "JTokens converted successfully",
      converted: numericAmount,
      nairaAdded: numericAmount,
      remainingTokens: updatedUser.jTokens,
      newBalance: updatedUser.balance,
      user: {
        balance: updatedUser.balance,
        jTokens: updatedUser.jTokens,
      },
    });
  } catch (error) {
    console.error("[convertJTokens] Error:", error.message);
    return res.status(500).json({
      message: "Server error during JToken conversion",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
