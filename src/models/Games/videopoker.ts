import mongoose, { Schema, Document } from "mongoose";

interface IGame extends Document {
    privateSeed: string;
    privateHash: string;
    publicSeed: string;
    playerID: string,
    betAmount: number,
    currencyId: string,
    deck: { rank: string, suit: string }[],
    hand: { rank: string, suit: string }[],
    status: string;
}

const GameSchema: Schema = new Schema({
    privateSeed: { type: String },
    privateHash: { type: String },
    publicSeed: {
        type: String,
        default: null
    },
    playerID: { type: String },
    betAmount: { type: Number },
    currencyId: { type: String },
    deck: [{ rank: { type: String }, suit: { type: String } }],
    hand: [{ rank: { type: String }, suit: { type: String } }],
    status: { type: String },
}, { timestamps: true });

export const VideoPoker = mongoose.model<IGame>("VideoPoker", GameSchema);
