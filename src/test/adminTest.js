import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { connectToDb } from "../database/connectToDb.js";

import User from "../models/users.js";
import History from "../models/history.js";
import Funding from "../models/funding.js";
import Admin from "../admin/models/admin.js";
import Service, { DEFAULT_SERVICES } from "../admin/models/service.js";
import PlatformSettings from "../admin/models/platformSettings.js";

dotenv.config();

// ══════════════════════════════════════════════════════
// Seed script — safe to re-run (clears only the sample data it
// creates, not your whole DB). Run with:
//
//   node src/scripts/seedAdminSampleData.js
//
// Uses your real DATABASE_URL, so this writes to whatever DB
// you're currently pointed at. Point at a dev/staging DB, not
// production, unless you mean to.
// ══════════════════════════════════════════════════════

const NAMES = [
  "Chinedu Okafor", "Amaka Nwosu", "Tunde Bakare", "Ngozi Eze",
  "Yusuf Abdullahi", "Bisi Adeyemi", "Emeka Okonkwo", "Folake Ogundipe",
  "Ibrahim Mohammed", "Chiamaka Obi", "Segun Adewale", "Blessing Etim",
  "Kelechi Nnamdi", "Aisha Bello", "Tobi Ojo", "Grace Effiong",
];

const NETWORKS = ["mtn", "glo", "airtel", "9mobile"];
const CABLE = ["dstv", "gotv", "startimes"];
const DISCOS = ["ikedc", "ekedc", "aedc", "phed", "kedco"];
const BETTING = ["bet9ja", "sportybet", "betking"];
const FUNDING_CHANNELS = ["Bank Transfer", "Card", "USSD"];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function seed() {
  await connectToDb();
  console.log("🌱 Seeding sample data...\n");

  // ── Clean previous sample-only data (tagged via email domain) ──
  await User.deleteMany({ email: { $regex: "@depay-sample.test$" } });
  await Admin.deleteMany({ email: "sample.admin@depay-sample.test" });
  await Service.deleteMany({});
  await PlatformSettings.deleteMany({});

  // ── 1. Admin account (password hashed via schema pre-save hook) ──
  const admin = await Admin.create({
    name: "Sample Admin",
    email: "sample.admin@depay-sample.test",
    password: "SamplePassword123",
    role: "admin",
  });
  console.log(`✅ Admin created — login with sample.admin@depay-sample.test / SamplePassword123`);

  // ── 2. Services catalog (reuses your real default set) ──
  await Service.insertMany(DEFAULT_SERVICES);
  console.log(`✅ ${DEFAULT_SERVICES.length} services seeded`);

  // ── 3. Platform settings singleton ──
  await PlatformSettings.create({ maintenanceMode: false });
  console.log("✅ Platform settings initialized");

  // ── 4. Users (30 sample users, realistic spread of states) ──
  const SAMPLE_USER_PASSWORD = "Password123";
  const hashedPassword = await bcrypt.hash(SAMPLE_USER_PASSWORD, 12);

  const users = [];
  for (let i = 0; i < 30; i++) {
    const name = NAMES[i % NAMES.length];
    const slug = name.toLowerCase().replace(/\s+/g, ".");
    users.push({
      fullName: name,
      email: `${slug}${i}@depay-sample.test`,
      password: hashedPassword,
      isEmailVerified: Math.random() > 0.15,
      phoneNumber: `080${randInt(10000000, 99999999)}`,
      gender: rand(["male", "female"]),
      isActivated: Math.random() > 0.08, // ~8% suspended, matches typical admin panel testing needs
      isWalletCreated: true,
      balance: randInt(0, 150000),
      lastLogin: daysAgo(randInt(0, 30)),
      bvn: Math.random() > 0.3 ? String(randInt(10000000000, 99999999999)) : null,
      nin: Math.random() > 0.4 ? String(randInt(10000000000, 99999999999)) : null,
      createdAt: daysAgo(randInt(1, 180)),
    });
  }
  const insertedUsers = await User.insertMany(users);
  console.log(`✅ ${insertedUsers.length} users seeded`);

  // ── 5. Transaction history (bill payments) per user ──
  const historyDocs = [];
  const STATUSES_WEIGHTED = [
    "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS",
    "PENDING", "PENDING",
    "FAILED", "FAILED",
  ];
  let refCounter = 1000;

  for (const user of insertedUsers) {
    const txCount = randInt(2, 12);
    for (let i = 0; i < txCount; i++) {
      const category = rand(["airtime", "data", "cable", "electricity", "betting"]);
      let serviceID;
      if (category === "airtime" || category === "data") serviceID = `${rand(NETWORKS)}-${category}`;
      else if (category === "cable") serviceID = rand(CABLE);
      else if (category === "electricity") serviceID = rand(DISCOS);
      else serviceID = rand(BETTING);

      const status = rand(STATUSES_WEIGHTED);
      const amount = randInt(200, 20000);

      historyDocs.push({
        userId: user._id,
        service: category,
        serviceID,
        amount,
        fee: Math.random() > 0.5 ? Math.round(amount * 0.01) : 0,
        transactionReference: `TX-${refCounter++}`,
        transactionNumber: `TXN${randInt(100000, 999999)}`,
        name: user.fullName,
        type: "DEBIT",
        status,
        createdAt: daysAgo(randInt(0, 60)),
      });
    }
  }
  await History.insertMany(historyDocs);
  console.log(`✅ ${historyDocs.length} transaction history records seeded`);

  // ── 6. Fundings (wallet deposits) per user ──
  const fundingDocs = [];
  for (const user of insertedUsers) {
    const fundCount = randInt(1, 5);
    for (let i = 0; i < fundCount; i++) {
      const amount = randInt(1000, 50000);
      fundingDocs.push({
        userId: user._id,
        amount,
        card_type: rand(FUNDING_CHANNELS),
        sender_name: user.fullName,
        fee: Math.round(amount * 0.005),
        date: daysAgo(randInt(0, 90)),
      });
    }
  }
  await Funding.insertMany(fundingDocs);
  console.log(`✅ ${fundingDocs.length} funding records seeded`);

  console.log("\n🎉 Done. Sample data is tagged with @depay-sample.test emails —");
  console.log(`   Sample users' password: ${SAMPLE_USER_PASSWORD}`);
  console.log("   re-run this script anytime to reset it without touching real data.");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});