import { Request, Response } from "express";
import { Games } from "../models"
import * as crypto from 'crypto';

type Suit = 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

type BetType = "Start" | "Skip" | "Lower" | "Higher" | "LOST";

interface Card {
    suit: Suit;
    rank: Rank;
}

// Function to generate a hash
const generateHash = (key: string): string => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

const generateCard = (publicKey: string, privateKey: string, round: number): Card => {
    const combinedKey = publicKey + privateKey + round.toString();
    const cardHash = crypto.createHash('sha256').update(combinedKey).digest('hex');
    // Card rank: values from 1 (Ace) to 13 (King)
    const cardRank = parseInt(cardHash.slice(0, 8), 16) % 13;
    console.log("card Rank", cardRank);
    // Card suit: 0 = Hearts, 1 = Diamonds, 2 = Clubs, 3 = Spades
    const suits: Suit[] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const cardSuitIndex = parseInt(cardHash.slice(8, 12), 16) % 4;
    const cardSuit = suits[cardSuitIndex];

    return { rank: ranks[cardRank], suit: cardSuit };
};

function getCardRankValue(card: Card): number {
    const rankValueMap: { [key in Rank]: number } = {
        'A': 1,
        '2': 2,
        '3': 3,
        '4': 4,
        '5': 5,
        '6': 6,
        '7': 7,
        '8': 8,
        '9': 9,
        '10': 10,
        'J': 11,
        'Q': 12,
        'K': 13,
    };

    return rankValueMap[card.rank];
}

const multipliers: { [key in Rank]: { [key in 'Lower' | 'Higher']: number } } = {
    'A': {
        'Lower': 12.870,
        'Higher': 1.073
    },
    '2': {
        'Higher': 1.073,
        'Lower': 6.435
    },
    '3': {
        'Higher': 1.170,
        'Lower': 4.290
    },
    '4': {
        'Higher': 1.287,
        'Lower': 3.217
    },
    '5': {
        'Higher': 1.430,
        'Lower': 2.574
    },
    '6': {
        'Higher': 1.609,
        'Lower': 2.145
    },
    '7': {
        'Higher': 1.839,
        'Lower': 1.839
    },
    '8': {
        'Higher': 2.145,
        'Lower': 1.609
    },
    '9': {
        'Higher': 2.574,
        'Lower': 1.43
    },
    '10': {
        'Higher': 3.217,
        'Lower': 1.287
    },
    'J': {
        'Higher': 4.290,
        'Lower': 1.170
    },
    'Q': {
        'Higher': 6.435,
        'Lower': 1.073
    },
    'K': {
        'Higher': 12.870,
        'Lower': 1.073
    }
}

type Hilo = {
    userId: string;
    currency: any;
    gameId: string;
    odds: number;
    amount: any;
    betting: {
        privateKey: string;
        publicKey: string;
        rounds: {
            card: Card,
            type: BetType,
            multiplier: number
        }[]
    };
    status: string;
}

export const fetchGame = async (req: Request, res: Response) => {
    const userId = "";
    const game: any = await Games.findOne({ userId: userId, status: "BET", gameId: "hilo" });
    if (game) {
        return res.json({
            status: true,
            gameId: game._id,
            odds: game.odds,
            publicKey: game.betting.publicKey,
            privateHash: generateHash(game.betting.publicKey),
            rounds: game.betting.rounds,
            profit: game.amount * game.odds,
            amount: game.amount,
            currency: game.currency
        })
    } else {
        return res.json({ status: false });
    }
}

export const onCreateBet = async (req: Request, res: Response) => {
    const { startCard, currencyId = "", amount } = req.body;
    const userId = "";
    const publicKey = crypto.randomBytes(32).toString('hex');
    const privateKey = crypto.randomBytes(32).toString('hex');
    const game: any = await Games.findOne({ userId: userId, status: "BET", gameId: "hilo" });
    if (game) {
        return res.json({
            status: true,
            odds: game.odds,
            publicKey: publicKey,
            privateHash: generateHash(privateKey),
            rounds: game.betting.rounds
        })
    } else {
        try {
            const newGame: any = new Games<Hilo>({
                userId: "",
                currency: currencyId,
                gameId: "hilo",
                odds: 1,
                amount: amount,
                betting: {
                    privateKey: privateKey,
                    publicKey: publicKey,
                    rounds: [
                        {
                            card: startCard,
                            type: "Start",
                            multiplier: 1
                        }
                    ]
                },
                status: "BET",
            });
            handleBalance(newGame.userId, newGame.currency, newGame.amount, "bet");

            await newGame.save();

            return res.json({
                status: true,
                odds: newGame.odds,
                publicKey: publicKey,
                privateHash: generateHash(privateKey),
                rounds: newGame.betting.rounds
            })
        } catch (error) {
            console.log(error)
            return res.status(400).json({ msg: "Invalid request" })
        }
    }
}

export const onBet = async (req: Request, res: Response) => {
    const { type }: { type: string } = req.body;
    const userId = "";
    try {
        const game: any = await Games.findOne({ userId: userId, status: "BET", gameId: "hilo" });
        if (game) {
            const { publicKey, privateKey, rounds } = game.betting;
            const newCard: Card = generateCard(publicKey, privateKey, rounds.length);
            const proviusCard = rounds[rounds.length - 1].card;

            const newValue = getCardRankValue(newCard);
            const proviusValue = getCardRankValue(proviusCard);
            if (type === "Same_L" || type === "Lower" || type === "LSame") {
                if ((proviusValue === 13 && newValue < proviusValue) || (proviusValue < 13 && newValue <= proviusValue)) {
                    game.odds = Math.floor((game.odds * multipliers[proviusCard.rank as Rank]["Lower"]) * 100) / 100;
                } else {
                    game.status = "LOST";
                }
            } else if (type === "Same_H" || type === "Higher" || type === "HSame") {
                if ((proviusValue === 1 && newValue > proviusValue) || (proviusValue > 1 && newValue >= proviusValue)) {
                    game.odds = Math.floor((game.odds * multipliers[proviusCard.rank as Rank]["Higher"]) * 100) / 100;
                } else {
                    game.status = "LOST";
                }
            }

            game.betting.rounds.push({
                card: newCard,
                type: type,
                multiplier: game.odds
            });
            await Games.findByIdAndUpdate(game._id,
                {
                    status: game.status,
                    odds: game.odds,
                    betting: game.betting
                })

            return res.json({
                status: true,
                odds: game.odds,
                profit: game.amount * game.odds,
                currency: game.currency,
                publicKey: publicKey,
                privateKey: game.status == "LOST" ? privateKey : "",
                privateHash: generateHash(privateKey),
                rounds: game.betting.rounds,
                type: game.status
            });
        } else {
            return res.json({
                status: false,
                msg: "Not found game"
            })
        }
    } catch (error) {
        console.log(error)
    }
    return res.status(400).json({ msg: "Invalid request" })
}

export const onCashOut = async (req: Request, res: Response) => {
    const userId = "";
    try {
        const game: any = await Games.findOne({ userId: userId, status: "BET", gameId: "hilo" });
        if (game) {
            game.status = "WIN";
            game.profit = game.amount * game.odds;
            handleBalance(game.userId, game.currency, game.profit, "settlement");
            await game.save();
            return res.json({ status: true, profit: game.profit, multiplier: game.odds, privateKey: game.betting.privateKey })
        } else {
            return res.json({
                status: false,
                msg: "Not found game"
            })
        }
    } catch (error) {
        console.log(error);
    }
    return res.status(400).json({ status: false, msg: "Invalid request" });
}


function handleBalance(userId: string, currencyId: string, amount: number, type: string) {
    console.log(userId, currencyId, amount, type)
}