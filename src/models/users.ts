import mongoose, { Schema, type HydratedDocument, type Model, type Query } from "mongoose";

// ══════════════════════════════════════════════════════════════════
// NOTE on `tag`: this field is referenced throughout the codebase —
// findByTag below, the referral-bonus lookup in
// webhook/version2/funds.ts (`User.findOne({ tag: user.referredBy })`),
// the JWT payload built at login (`{ id, email, tag }`), and several
// indexes further down — but it was never actually defined on this
// schema before this TypeScript conversion. Since Mongoose drops
// unknown paths on save by default (strict mode, which this schema
// uses), `tag` was always `undefined` for every user: nothing ever
// persisted it, `utils/generateTag.ts`'s `generateUserTag()` exists
// but is never called anywhere, and no registration path assigns it.
// In practice this means the referral-bonus system has been
// silently non-functional — the lookup that's supposed to find a
// referrer by their tag can never match anything.
//
// Added the field here (typed, indexed, matching what every other
// file already assumed existed) so the codebase is now internally
// consistent — but that alone doesn't make referrals start working.
// Someone still needs to call `generateUserTag()` at registration and
// assign the result. Left that out of this pass since it's a
// behavior change beyond "convert to TypeScript" and worth a
// deliberate decision (e.g. should existing users get backfilled a
// tag?) rather than a silent side effect of a type conversion.
// ══════════════════════════════════════════════════════════════════

export interface IAccountDetail {
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  isDefault: boolean;
}

export type Gender = "male" | "female" | "other" | "prefer-not-to-say";

export interface IUser {
  fullName?: string;
  email: string;
  password?: string;
  isEmailVerified: boolean;
  phoneNumber?: string;
  gender: Gender;
  dateOfBirth?: Date;
  isActivated: boolean;
  isWalletCreated: boolean;
  transactionPIN?: string;
  profilePicture: string;
  otp?: string | null;
  otpExpires?: Date | null;
  balance: number;
  pushToken?: string;
  lastLogin?: Date;
  lastTransaction?: Date;
  loginAttempts: number;
  loginAttemptWindowStart?: Date | null;
  lockUntil?: Date;
  isOnline: boolean;
  otpAttempts: number;
  otpAttemptWindowStart?: Date | null;
  accountLockedUntil?: Date | null;
  referredBy?: string;
  redeemed: boolean;
  refreshToken?: string | null;
  jTokens: number;
  refreshTokenExpiresAt?: Date | null;
  tag?: string;

  // Reserved account fields (Monnify)
  bvn?: string | null;
  nin?: string | null;
  reservedAccountReference?: string | null;
  reservedAccountName?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountDetails: IAccountDetail[];

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserVirtuals {
  isLocked: boolean;
  formattedBalance: string;
  displayName: string;
  age: number | null;
  maskedAccountNumber: string | null;
  defaultAccount: IAccountDetail | null;
}

export interface IUserMethods {
  hasSufficientBalance(amount: number): boolean;
  incrementLoginAttempts(): Promise<unknown>;
  resetLoginAttempts(): Promise<unknown>;
  setPrimaryAccount(accountNumber: string): Promise<UserDocument>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods & IUserVirtuals>;

// The four custom query helpers below (byBalanceRange/active/recent/
// withBankAccounts) aren't called anywhere in the codebase today —
// confirmed by grep before writing this file. Mongoose's TS typing
// for query helpers requires threading a query-helpers generic
// through every model usage site across the whole codebase for a
// feature nothing currently uses, so `IUserQueryHelpers` here is
// intentionally loose (index signature, not per-method signatures)
// rather than fully wired into IUserModel's generics. If you start
// using them, worth tightening then.
interface IUserQueryHelpers {
  [key: string]: (...args: any[]) => any;
}

interface IUserModel extends Model<IUser, IUserQueryHelpers, IUserMethods, IUserVirtuals> {
  findByEmail(email: string): Promise<UserDocument | null>;
  findByTag(tag: string): Promise<UserDocument | null>;
  findActiveUsers(): Promise<UserDocument[]>;
  getTopUsersByBalance(limit?: number): Promise<UserDocument[]>;
  findByGender(gender: string): Promise<UserDocument[]>;
  findByAgeRange(minAge: number, maxAge: number): Promise<UserDocument[]>;
  findByAccountNumber(accountNumber: string): Promise<UserDocument | null>;
  findByReservedAccountReference(reference: string): Promise<UserDocument | null>;
}

const userSchema = new Schema<IUser, IUserModel, IUserMethods, IUserQueryHelpers, IUserVirtuals>(
  {
    fullName: {
      type: String,
      required: false,
      minlength: 3,
      maxlength: 255,
      trim: true,
      index: "text",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      minlength: 3,
      maxlength: 255,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: false,
      minlength: 8,
      maxlength: 250,
      select: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    phoneNumber: {
      type: String,
      unique: true,
      sparse: true,
      minlength: 10,
      maxlength: 11,
      trim: true,
      index: true,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say"],
      default: "prefer-not-to-say",
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (value: Date) {
          if (!value) return true;
          const today = new Date();
          const birthDate = new Date(value);
          const age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (birthDate > today) return false;
          if (age < 13) return false;
          if (age === 13 && monthDiff < 0) return false;
          return true;
        },
        message:
          "Please provide a valid date of birth. User must be at least 13 years old and date cannot be in the future.",
      },
    },
    isActivated: {
      type: Boolean,
      default: false,
      index: true,
    },
    isWalletCreated: {
      type: Boolean,
      default: false,
      index: true,
    },
    transactionPIN: {
      type: String,
      minlength: 4,
      maxlength: 250,
      select: true,
    },
    profilePicture: {
      type: String,
      default:
        "https://res.cloudinary.com/dsgvfker6/image/upload/v1745674985/fj6fcqedr3z2hjedtfuh.jpg",
    },
    otp: {
      type: String,
      select: true,
      index: true,
      sparse: true,
    },
    otpExpires: {
      type: Date,
      select: true,
      index: true,
      expires: 600,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    pushToken: {
      type: String,
      sparse: true,
      index: true,
    },
    lastLogin: {
      type: Date,
      index: true,
    },
    lastTransaction: {
      type: Date,
      index: true,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    loginAttemptWindowStart: {
      type: Date,
      select: false,
    },
    lockUntil: {
      type: Date,
      select: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpAttemptWindowStart: {
      type: Date,
    },
    accountLockedUntil: {
      type: Date,
    },
    referredBy: {
      type: String,
      trim: true,
      index: true,
    },
    redeemed: {
      type: Boolean,
      default: false,
      index: true,
    },
    // ── Refresh token (biometric login) ──────────────────────────
    refreshToken: {
      type: String,
      default: null,
      select: false,
    },
    jTokens: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    refreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    tag: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      index: true,
    },

    // ==========================================
    // RESERVED ACCOUNT FIELDS (Monnify)
    // ==========================================

    // Sensitive KYC — hidden from queries by default
    bvn: {
      type: String,
      trim: true,
      sparse: true,
      select: false,
      default: null,
      match: /^\d{11}$/,
    },
    nin: {
      type: String,
      trim: true,
      sparse: true,
      select: false,
      default: null,
      match: /^\d{11}$/,
    },

    // Monnify reservation identifiers
    reservedAccountReference: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      default: null,
    },
    reservedAccountName: {
      type: String,
      trim: true,
      default: null,
    },

    // Primary bank account (synced from accountDetails[0] or default)
    bankName: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      default: null,
    },
    accountNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
      default: null,
      minlength: 10,
      maxlength: 10,
      match: /^\d{10}$/,
    },

    // Full list of reserved accounts from Monnify (multiple banks)
    accountDetails: [
      {
        bankCode: { type: String, trim: true },
        bankName: { type: String, trim: true },
        accountNumber: {
          type: String,
          trim: true,
          match: /^\d{10}$/,
        },
        accountName: { type: String, trim: true },
        isDefault: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
    minimize: false,
    autoIndex: process.env.NODE_ENV !== "production",
    id: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.transactionPIN;
        delete ret.otp;
        delete ret.otpExpires;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.bvn; // never expose in JSON responses
        delete ret.nin; // never expose in JSON responses
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.transactionPIN;
        delete ret.otp;
        delete ret.otpExpires;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.bvn;
        delete ret.nin;
        return ret;
      },
    },
  },
);

// ==========================================
// COMPOUND INDEXES FOR PERFORMANCE
// ==========================================

userSchema.index({ email: 1, balance: 1 });
userSchema.index({ tag: 1, isActivated: 1 });
userSchema.index({ isActivated: 1, isWalletCreated: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ balance: -1 });
userSchema.index({ isActivated: 1, createdAt: -1 });
userSchema.index({ fullName: "text", email: "text", tag: "text" });
userSchema.index({ gender: 1 });
userSchema.index({ dateOfBirth: -1 });
userSchema.index({ bankName: 1, accountNumber: 1 });
userSchema.index({ "accountDetails.accountNumber": 1 });

// ==========================================
// VIRTUAL FIELDS
// ==========================================

userSchema.virtual("isLocked").get(function (this: UserDocument) {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

userSchema.virtual("formattedBalance").get(function (this: UserDocument) {
  return `₦${this.balance?.toLocaleString() || "0"}`;
});

userSchema.virtual("displayName").get(function (this: UserDocument) {
  return this.fullName || this.email.split("@")[0];
});

userSchema.virtual("age").get(function (this: UserDocument) {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
});

userSchema.virtual("maskedAccountNumber").get(function (this: UserDocument) {
  if (!this.accountNumber) return null;
  return `****${this.accountNumber.slice(-4)}`;
});

userSchema.virtual("defaultAccount").get(function (this: UserDocument) {
  if (this.accountDetails && this.accountDetails.length > 0) {
    return (
      this.accountDetails.find((acc) => acc.isDefault) || this.accountDetails[0]
    );
  }
  return null;
});

// ==========================================
// INSTANCE METHODS
// ==========================================

userSchema.methods.hasSufficientBalance = function (this: UserDocument, amount: number) {
  return this.balance >= amount;
};

userSchema.methods.incrementLoginAttempts = function (this: UserDocument) {
  if (this.lockUntil && this.lockUntil.getTime() < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }
  const updates: Record<string, unknown> = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) };
  }
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function (this: UserDocument) {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 },
  });
};

userSchema.methods.setPrimaryAccount = async function (
  this: UserDocument,
  accountNumber: string,
) {
  if (!this.accountDetails || this.accountDetails.length === 0) {
    throw new Error("No bank accounts found");
  }

  // Remove default from all accounts
  this.accountDetails.forEach((acc) => {
    acc.isDefault = false;
  });

  // Set new default
  const account = this.accountDetails.find(
    (acc) => acc.accountNumber === accountNumber,
  );
  if (account) {
    account.isDefault = true;
    this.bankName = account.bankName;
    this.accountNumber = account.accountNumber;
  }

  return this.save();
};

// ==========================================
// STATIC METHODS
// ==========================================

userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.findByTag = function (tag: string) {
  return this.findOne({ tag: tag.toUpperCase().trim() });
};

userSchema.statics.findActiveUsers = function () {
  return this.find({ isActivated: true, isWalletCreated: true });
};

userSchema.statics.getTopUsersByBalance = function (limit = 10) {
  return this.find({ isActivated: true })
    .sort({ balance: -1 })
    .limit(limit)
    .select("fullName email tag balance profilePicture gender");
};

userSchema.statics.findByGender = function (gender: string) {
  return this.find({ gender: gender.toLowerCase().trim() });
};

userSchema.statics.findByAgeRange = function (minAge: number, maxAge: number) {
  const today = new Date();
  const maxDate = new Date(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate(),
  );
  const minDate = new Date(
    today.getFullYear() - maxAge - 1,
    today.getMonth(),
    today.getDate(),
  );
  return this.find({ dateOfBirth: { $gte: minDate, $lte: maxDate } });
};

userSchema.statics.findByAccountNumber = function (accountNumber: string) {
  return this.findOne({
    $or: [
      { accountNumber },
      { "accountDetails.accountNumber": accountNumber },
    ],
  });
};

userSchema.statics.findByReservedAccountReference = function (reference: string) {
  return this.findOne({ reservedAccountReference: reference });
};

// ==========================================
// QUERY HELPERS (not currently used anywhere — see note above)
// ==========================================

userSchema.query.byBalanceRange = function (this: any, min: number, max: number) {
  return this.where("balance").gte(min).lte(max);
};

userSchema.query.active = function (this: any) {
  return this.where({ isActivated: true, isWalletCreated: true });
};

userSchema.query.recent = function (this: any, days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return this.where("createdAt").gte(date);
};

userSchema.query.withBankAccounts = function (this: any) {
  return this.where({
    $or: [
      { accountNumber: { $exists: true, $ne: null } },
      { "accountDetails.0": { $exists: true } },
    ],
  });
};

// ==========================================
// MIDDLEWARE
// ==========================================

userSchema.pre("save", function (next) {
  if (this.isModified("email")) {
    this.email = this.email.toLowerCase().trim();
  }
  if (this.isModified("tag") && this.tag) {
    this.tag = this.tag.toUpperCase().trim();
  }
  if (this.isModified("fullName") && this.fullName) {
    this.fullName = this.fullName.trim();
  }
  if (this.isModified("phoneNumber") && this.phoneNumber) {
    this.phoneNumber = this.phoneNumber.trim();
  }
  if (this.isModified("gender") && this.gender) {
    this.gender = this.gender.toLowerCase() as Gender;
  }
  if (this.isModified("dateOfBirth") && this.dateOfBirth) {
    this.dateOfBirth = new Date(this.dateOfBirth);
  }

  // Validate account number format if provided
  if (this.isModified("accountNumber") && this.accountNumber) {
    if (!/^\d{10}$/.test(this.accountNumber)) {
      return next(new Error("Account number must be exactly 10 digits"));
    }
  }

  // Sync top-level bankName/accountNumber from accountDetails if not already set
  if (
    this.isModified("accountDetails") &&
    this.accountDetails &&
    this.accountDetails.length > 0
  ) {
    const defaultAccount =
      this.accountDetails.find((acc) => acc.isDefault) ||
      this.accountDetails[0];
    if (defaultAccount && (!this.bankName || !this.accountNumber)) {
      this.bankName = defaultAccount.bankName ?? null;
      this.accountNumber = defaultAccount.accountNumber ?? null;
    }
  }

  next();
});

// ==========================================
// PERFORMANCE OPTIMIZATIONS
// ==========================================

userSchema.set("collection", "users");

// NOTE: there used to be a `bulkBalanceUpdate` static here that did a
// raw `$inc: { balance }` bulkWrite, bypassing the ledger entirely
// (no LedgerEntry rows, no idempotency, no audit trail). It was
// unused anywhere in the codebase, so it's been removed rather than
// left as a foot-gun — every balance change must go through
// creditWallet/debitWallet in src/service/ledger/ledgerService.ts.
// If you need a genuine bulk-credit operation (e.g. a promo payout
// to many users), add a `bulkCredit` helper to the ledger service
// that loops calls to creditWallet with a per-user reference, rather
// than reintroducing a direct balance $inc here.

const User = mongoose.model<IUser, IUserModel>("User", userSchema);

export default User;
