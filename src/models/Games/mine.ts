import mongoose, { Document, Schema } from "mongoose";

enum MINE_OBJECT {
  HIDDEN = 0,
  GEM = 1,
  BOMB = 2,
}

interface Mine extends Document {
  amount: number;
  // user: Schema.Types.ObjectId;
  status: string;
  mines: number;
  count: number;
  grid: { point: number; mine: MINE_OBJECT; mined: boolean }[];
}

const MineSchema: Schema = new Schema({
  amount: { type: Number, required: true },
  // user: { type: Schema.Types.ObjectId, ref: "User", }, // Reference to a User model
  status: { type: String, default: "BET" },
  mines: { type: Number, required: true },
  count: { type: Number, default: 0 },
  grid: [
    {
      point: { type: Number, required: true },
      mine: { type: Number, required: true }, // Enum as Number
      mined: { type: Boolean, default: false },
    },
  ],
},
  { timestamps: true });

export const MineGame = mongoose.model<Mine>("MineGame", MineSchema);
