import mongoose, { Schema, Document } from 'mongoose';

// Types and Constants
type Suit = 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
    suit: Suit;
    rank: Rank;
}

type Chip = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Place = 'Player' | 'Banker' | 'Tie' | 'PPair' | 'BPair';

type Bet = {
    place: Place;
    chip: Chip;
}

type Player = {
    PlayerID: string,
    bets: Bet[],
    currencyId: string
}

// Mongoose Schema and Model Definitions

const CardSchema = new Schema<Card>({
    suit: { type: String, enum: ['Hearts', 'Diamonds', 'Clubs', 'Spades'], required: true },
    rank: { type: String, enum: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], required: true },
});

const BetSchema = new Schema<Bet>({
    place: { type: String, enum: ['Player', 'Banker', 'Tie', 'PPair', 'BPair'], required: true },
    chip: { type: Number, enum: [0, 1, 2, 3, 4, 5, 6], required: true },
});

const PlayerSchema = new Schema<Player>({
    PlayerID: { type: String, required: true },
    bets: { type: [BetSchema], required: true },
    currencyId: { type: String, required: true },
});

interface IGame extends Document {
    privateSeed: string;
    publicSeed: string;
    bets: Player[];
    playerHand: Card[];
    bankerHand: Card[];
    status: string;
}

const GameSchema = new Schema<IGame>({
    privateSeed: { type: String, required: true },
    publicSeed: { type: String, required: true },
    bets: { type: [PlayerSchema], default: [] },
    playerHand: { type: [CardSchema], default: [] },
    bankerHand: { type: [CardSchema], default: [] },
    status: { type: String, enum: ['BET', 'END'], required: true }
},
    { timestamps: true });


export const BaccaratGame = mongoose.model<IGame>('BaccaratGame', GameSchema);
