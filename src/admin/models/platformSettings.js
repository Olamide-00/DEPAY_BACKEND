import mongoose from "mongoose";

// ══════════════════════════════════════════════════════
// Singleton document — there is only ever one PlatformSettings
// row, fetched/created via getOrCreate() below. Keeping it as its
// own tiny collection (rather than a field bolted onto Admin)
// means maintenance mode is a platform-wide switch, not tied to
// whichever admin last touched it.
// ══════════════════════════════════════════════════════

const platformSettingsSchema = new mongoose.Schema(
  {
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true }
);

const PlatformSettings = mongoose.model(
  "PlatformSettings",
  platformSettingsSchema
);

export const getOrCreatePlatformSettings = async () => {
  let doc = await PlatformSettings.findOne();
  if (!doc) {
    doc = await PlatformSettings.create({});
  }
  return doc;
};

export default PlatformSettings;