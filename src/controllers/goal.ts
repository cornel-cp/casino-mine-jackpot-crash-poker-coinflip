import { Request, Response } from "express";
import * as crypto from 'crypto';
import { Games } from "../models"

type GameSize = 0 | 1 | 2;

type GoalGameType = {
    privateKey: string;
    publicKey: string;
    size: GameSize;
    rounds: number[]
}

const GAME_ID = "goal";

const grids = {
    0: {
        w: 3,
        h: 4,
        multipliers: [1.45, 2.18, 3.27, 4.91]
    },
    1: {
        w: 4,
        h: 7,
        multipliers: [1.29, 1.72, 2.30, 3.30, 4.09, 5.45, 7.27]
    },
    2: {
        w: 5,
        h: 10,
        multipliers: [1.21, 1.52, 1.89, 2.37, 2.96, 3.79, 4.64, 5.78, 7.23, 9.03]
    },
}

const generateHash = (key: string): string => {
    return crypto.createHash('sha256').update(key).digest('hex');
};

const hashToColumnPosition = (hash: string, gridWidth: number): number => {
    return parseInt(hash.substring(0, 8), 16) % gridWidth;
};

export const createBet = async (req: Request, res: Response) => {
    const { amount, currency, size } = req.body;
    console.log(amount, currency, size)
    try {
        if (!grids[size as GameSize]) {
            return res.status(400).json({ status: false, msg: "Invalid grid size" });
        }

        const publicKey = crypto.randomBytes(32).toString('hex');
        const privateKey = crypto.randomBytes(32).toString('hex');

        const userId = "";

        const game: any = await Games.findOne({
            userId,
            status: "BET"
        });

        if (game) {
            return res.json({
                status: true,
                gameId: game._id,
                publicKey: game.betting.publicKey,
                size: game.betting?.size,
                amount: game.amount,
                currency: game.currency,
                rounds: game.betting?.rounds,
                privateHash: generateHash(game.betting.privateKey)
            });
        } else {
            const newgame = new Games({
                userId,
                currency,
                odds: 1,
                amount,
                profit: 0,
                gameId: GAME_ID,
                betting: {
                    privateKey: privateKey,
                    publicKey: publicKey,
                    size: size,
                    rounds: []
                },
                status: "BET"
            });

            await newgame.save();
            handleBalance(userId, -amount, currency, "BET");
            return res.json({
                status: true,
                gameId: newgame._id,
                publicKey,
                size: newgame.betting.size,
                amount: newgame.amount,
                currency: newgame.currency,
                rounds: newgame.betting.rounds,
                privateHash: generateHash(privateKey)
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: false, msg: "Internal server error" });
    }
};


export const onBet = async (req: Request, res: Response) => {
    const { position } = req.body;
    const userId = "";

    try {
        const game = await Games.findOne({ gameId: GAME_ID, userId, status: "BET" });
        if (!game) {
            return res.status(404).json({ status: false, msg: "Game not found" });
        }

        if (game.status !== "BET") {
            return res.status(400).json({ status: false, msg: "Betting is closed for this game" });
        }

        const grid = grids[game.betting.size as GameSize];
        const currentRound = game.betting.rounds.length;

        if (currentRound >= grid.h) {
            return res.status(400).json({ status: false, msg: "All rounds completed" });
        }

        const roundHash = generateHash(game.betting.privateKey + game.betting.publicKey + currentRound);

        const lossColumn = hashToColumnPosition(roundHash, grid.w);
        const multiplier: number = grid.multipliers[currentRound];
        const profit = game.amount * multiplier;

        if (lossColumn === position) {
            game.status = "LOST";
        } else if (currentRound === grid.h - 1) {
            game.profit = profit;
            game.status = "WIN";
            game.odds = multiplier;
            handleBalance(game.userId, game.profit, game.currency, "SETTLEMENT");
        }

        game.betting.rounds.push({ position, lossPostion: lossColumn });
        await Games.findByIdAndUpdate(game._id, { profit: game.profit, status: game.status, betting: game.betting });

        return res.json({
            status: true,
            size: game.betting.size,
            row: currentRound,
            result: game.status,
            rounds: game.betting.rounds,
            privateKey: (game.status === "LOST" || game.status === "WIN") ? game.betting.privateKey : "",
            profit: profit,
            multiplier: multiplier
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: false, msg: "Internal server error" });
    }
};

export const onCashout = async (req: Request, res: Response) => {
    const userId = "";
    try {
        const game = await Games.findOne({ gameId: GAME_ID, userId, status: "BET" });
        if (!game) {
            return res.status(404).json({ status: false, msg: "Game not found" });
        }
        // If the player cashes out before the game ends, calculate the profit based on the last completed round
        const lastRound = game.betting.rounds.length - 1;
        const multiplier: number = grids[game.betting.size as GameSize].multipliers[lastRound];
        game.odds = multiplier;
        game.profit = game.amount * multiplier;
        game.status = "CASHOUT";
        handleBalance(game.userId, game.profit, game.currency, "CASHOUT");

        await game.save();

        return res.json({
            status: true,
            publicKey: game.betting.publicKey,
            privateKey: game.betting.privateKey,
            rounds: game.betting.rounds,
            profit: game.profit,
            multiplier,
            size: game.betting.size
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: false, msg: "Internal server error" });
    }
};

const handleBalance = (userId: string, amount: number, currency: string, type: string) => {
    console.log(userId, amount, currency, type)
}