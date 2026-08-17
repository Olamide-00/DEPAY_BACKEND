import User from "../../models/users.js";

export interface AwardJTokensResult {
  awarded: boolean;
  jtokens: number | null;
}

export const awardJTokens = async (
  email: string,
  amount: number,
): Promise<AwardJTokensResult> => {
  try {
    if (!email || !amount || amount <= 450) {
      return { awarded: false, jtokens: null };
    }

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase().trim() },
      { $inc: { jTokens: 2 } },
      { new: true },
    );

    if (!user) {
      console.warn(`[awardJTokens] User not found: ${email}`);
      return { awarded: false, jtokens: null };
    }

    console.log(
      `[awardJTokens] +2 JTokens awarded to ${email} | New total: ${user.jTokens}`,
    );
    return { awarded: true, jtokens: user.jTokens };
  } catch (error) {
    // Never throw — this should never break the calling flow
    console.error(
      `[awardJTokens] Error awarding tokens to ${email}:`,
      error instanceof Error ? error.message : error,
    );
    return { awarded: false, jtokens: null };
  }
};
