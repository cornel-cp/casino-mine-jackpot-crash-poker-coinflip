import mongoose, { Schema, Document } from "mongoose";

interface IGame extends Document {
  privateSeed: string;
  privateHash: string;
  publicSeed: string;
  players: {
    playerID: string; // mongoose.Types.ObjectId[];
    betAmount: number;
    currencyId: string; // mongoose.Types.ObjectId[];
    crashPoint: number;
    status: string;
  }[];
  crashPoint: number;
  status: string;
  startedAt: Date
}

const GameSchema: Schema = new Schema({
  privateSeed: { type: String },
  privateHash: { type: String },
  publicSeed: {
    type: String,
    default: null
  },
  players: [
    {
      playerID: { type: String },
      betAmount: { type: Number },
      currencyId: { type: String },
      crashPoint: { type: Number },
      status: { type: String },
    },
  ],
  crashPoint: { type: Number, default: 1 },
  status: { type: String },
  startedAt: { type: Date }
},
  { timestamps: true });

export const CrashGame = mongoose.model<IGame>("CrashGame", GameSchema);
