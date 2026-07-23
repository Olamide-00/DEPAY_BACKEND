import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import {
  sendRegistrationOTP,
  completeRegistration,
  verifyOTP,
  loginUser,
  resendOTP,
  getUser,
  setProfilePicture,
  getWalletBalance,
  sendTransactionOTP,
  sendResetOTP,
  verifyResetOTP,
  updateUserProfile,
  deleteUserByEmail,
  refreshAccessToken,
} from "../controller/version2/userController/user.js";
import { googleLogin } from "../controller/version2/userController/googleLogin.js";

const router = express.Router();

router.post("/send-registration-otp", sendRegistrationOTP);
// Step 2: verify OTP → email marked as verified
router.post("/verify-otp", verifyOTP);
// Step 3: submit name + password → account created
router.post("/register", completeRegistration);
//google login
router.post("/auth/google-login", googleLogin);

router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);
router.post("/resend-otp", resendOTP);
router.get("/user/:email", getUser);
router.post("/set-profile-picture", setProfilePicture);
router.get("/balance/:email", getWalletBalance);
router.post("/forgotOTP", sendTransactionOTP);
router.post("/init-OTP", sendResetOTP);
router.post("/verify-reset-OTP", verifyResetOTP);
router.put("/update-profile/:email", verifyToken, updateUserProfile);
router.delete("/delete/:email", verifyToken, deleteUserByEmail);

export default router;
