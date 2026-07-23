import User from "../models/users.js";

export const getBalance = async (email) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("User not found");
    }
    return user.balance;
  } catch (error) {
    throw new Error(error.message);
  }
};
