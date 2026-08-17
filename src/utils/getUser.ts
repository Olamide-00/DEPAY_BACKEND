import User, { type UserDocument } from "../models/users.js";

export const getUser = async (email: string): Promise<UserDocument> => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};
