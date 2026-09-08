import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";

export interface INotificationPrefs {
  txAlerts: boolean;
  failedAlerts: boolean;
  largeFunding: boolean;
  newSignups: boolean;
  weeklyDigest: boolean;
}

export interface IAdmin {
  name: string;
  email: string;
  password: string;
  role: string;
  notificationPrefs: INotificationPrefs;
  apiKeyHash: string | null;
  apiKeyLastFour: string | null;
  resetPasswordTokenHash: string | null;
  resetPasswordExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdminMethods {
  comparePassword(plain: string): Promise<boolean>;
}

export type AdminDocument = HydratedDocument<IAdmin, IAdminMethods>;

type AdminModel = Model<IAdmin, {}, IAdminMethods>;

const adminSchema = new Schema<IAdmin, AdminModel, IAdminMethods>(
  {
    name: { type: String, trim: true, default: "" },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: { type: String, default: "admin" },
    notificationPrefs: {
      txAlerts: { type: Boolean, default: true },
      failedAlerts: { type: Boolean, default: true },
      largeFunding: { type: Boolean, default: true },
      newSignups: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: false },
    },
    apiKeyHash: { type: String, default: null, select: false },
    apiKeyLastFour: { type: String, default: null },
    resetPasswordTokenHash: { type: String, default: null, select: false },
    resetPasswordExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

adminSchema.methods.comparePassword = function (
  this: AdminDocument,
  plain: string,
) {
  return bcrypt.compare(plain, this.password);
};

export default mongoose.model<IAdmin, AdminModel>("Admin", adminSchema);
