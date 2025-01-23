import { Schema, model } from "mongoose";


interface Game extends Document {
    userId: string;
    currency: string;
    gameId: string;
    odds: number;
    amount: number;
    profit: number;
    betting: any;
    status: "BET" | "DRAW" | "LOST" | "WIN" | "CASHOUT"
}


const GamesSchema = new Schema(
    {
        userId: {
            // type: Schema.Types.ObjectId,
            // ref: "users",
            type: String,
            require: true,
            index: true,
        },
        currency: {
            type: String,
            require: true,
        },
        gameId: {
            // type: Schema.Types.ObjectId,
            // ref: "game_lists",
            // require: true,
            type: String
        },
        odds: {
            type: Number,
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        profit: {
            type: Number,
            default: 0,
            require: true,
        },
        betting: {
            type: Object,
        },
        status: {
            type: String,
            default: "BET",
            enum: ["BET", "DRAW", "LOST", "WIN", "CASHOUT"],
            require: true,
        },
    },
    { timestamps: true }
);

export const Games = model<Game>("games", GamesSchema);
