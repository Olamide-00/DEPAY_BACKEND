import Funding from "../models/funding.js";
import User from "../models/users.js";

export const getUserFundingHistory = async (req, res) => {
  const { email } = req.params;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const fundingHistory = await Funding.find({ userId: user._id }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      message: "Funding history fetched successfully.",
      data: fundingHistory,
    });
  } catch (error) {
    console.error("Error fetching funding history:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
