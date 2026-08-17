import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

// ══════════════════════════════════════════════════════
// Singleton document — there is only ever one PlatformSettings
// row, fetched/created via getOrCreate() below. Keeping it as its
// own tiny collection (rather than a field bolted onto Admin)
// means maintenance mode is a platform-wide switch, not tied to
// whichever admin last touched it.
// ══════════════════════════════════════════════════════

export interface IPlatformSettings {
  maintenanceMode: boolean;
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PlatformSettingsDocument = HydratedDocument<IPlatformSettings>;

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

const PlatformSettings: Model<IPlatformSettings> = mongoose.model<IPlatformSettings>(
  "PlatformSettings",
  platformSettingsSchema,
);

export const getOrCreatePlatformSettings = async (): Promise<PlatformSettingsDocument> => {
  let doc = await PlatformSettings.findOne();
  if (!doc) {
    doc = await PlatformSettings.create({});
  }
  return doc;
};

export default PlatformSettings;
