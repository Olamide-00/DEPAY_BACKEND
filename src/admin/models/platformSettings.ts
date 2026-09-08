import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

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

const PlatformSettings: Model<IPlatformSettings> =
  mongoose.model<IPlatformSettings>("PlatformSettings", platformSettingsSchema);

export const getOrCreatePlatformSettings =
  async (): Promise<PlatformSettingsDocument> => {
    let doc = await PlatformSettings.findOne();
    if (!doc) {
      doc = await PlatformSettings.create({});
    }
    return doc;
  };

export default PlatformSettings;
