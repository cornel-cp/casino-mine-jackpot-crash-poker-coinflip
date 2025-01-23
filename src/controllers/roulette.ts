import { Request, Response } from "express";
import { Games } from "../models";
import * as crypto from 'crypto';

type Roulette = {
    userId: string;
    currency: any;
    gameId: string;
    odds: number;
    amount: any;
    profit: number;
    betting: {
        clientSeed: string;
        serverSeed: string;
        outcome: number;
        bets: { placeId: string | number, amount: number }[]
    };
    status: string;
};

const betMultipliers: { [key: string]: number } = {
    'number': 35,        // Specific number bet (0-36)
    '1_to_12': 3,        // Dozen bets
    '13_to_24': 3,
    '25_to_36': 3,
    '1_to_18': 2,        // Low bets
    '19_to_36': 2,       // High bets
    'Even': 2,           // Even numbers
    'Odd': 2,            // Odd numbers
    'Red': 2,            // Red numbers
    'Black': 2,          // Black numbers
    '2:1:0': 3,      // Column bets
    '2:1:1': 3,
    '2:1:2': 3
};

const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

// Helper function to determine bet type and outcome
const checkBetWin = (placeId: string | number, outcome: number): boolean => {
    if (typeof placeId === 'number') {
        return placeId === outcome;
    }
    if (placeId === '1_to_12') return outcome >= 1 && outcome <= 12;
    if (placeId === '13_to_24') return outcome >= 13 && outcome <= 24;
    if (placeId === '25_to_36') return outcome >= 25 && outcome <= 36;
    if (placeId === '1_to_18') return outcome >= 1 && outcome <= 18;
    if (placeId === '19_to_36') return outcome >= 19 && outcome <= 36;
    if (placeId === 'Even') return outcome % 2 === 0 && outcome !== 0;
    if (placeId === 'Odd') return outcome % 2 !== 0;
    if (placeId === 'Red') return redNumbers.includes(outcome);
    if (placeId === 'Black') return blackNumbers.includes(outcome);
    if (placeId === '2:1:0') return [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(outcome);
    if (placeId === '2:1:1') return [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(outcome);
    if (placeId === '2:1:2') return [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(outcome);
    return false;
};

// Profit Calculation
const calculateProfit = (bets: { placeId: string | number, amount: number }[], outcome: number, houseEdge: number) => {
    let totalBetAmount = 0;
    let totalProfit = 0;
    for (let bet of bets) {
        const betWon = checkBetWin(bet.placeId, outcome);
        totalBetAmount += bet.amount;
        if (betWon) {
            const multiplier = typeof bet.placeId === 'number' ? betMultipliers['number'] : betMultipliers[bet.placeId];
            totalProfit += bet.amount * multiplier;
        }
    }
    // Apply the house edge to the total profit
    return { profit: totalProfit * (1 - houseEdge), lossAmount: totalBetAmount - totalProfit, totalAmount: totalBetAmount };
};

const generateSeed = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Generate roulette outcome number based on hash and seeds
const generateRouletteOutcome = (privateSeed: string, publicSeed: string) => {
    const hash = crypto.createHmac('sha256', privateSeed).update(publicSeed).digest('hex');
    const maxNumber = 37;
    const rawNumber = parseInt(hash.slice(0, 8), 16) % maxNumber;
    return rawNumber;  // Returning raw number between 0-36
};

export const onCreateBet = (req: Request, res: Response) => {
    const userId = "";
    const { currency, clientSeed: _clientSeed, bets } = req.body;
    const serverSeed: string = generateSeed();
    const clientSeed = _clientSeed || generateSeed();

    const houseEdge = 0.0526;

    try {
        const outcome = generateRouletteOutcome(serverSeed, clientSeed);
        const { profit, lossAmount, totalAmount } = calculateProfit(bets, outcome, houseEdge);
        handleBalance(userId, currency, -totalAmount, "bet");
        const status = profit > 0 ? "WIN" : "LOST";
        const newGame = new Games<Roulette>({
            userId: userId,
            currency: currency,
            gameId: "roulette",
            amount: totalAmount,
            profit: profit,
            odds: 0,
            betting: {
                serverSeed,
                clientSeed,
                outcome: outcome,
                bets
            },
            status: status
        });
        newGame.save();
        handleBalance(userId, currency, profit, "settlement");
        return res.json({ status: true, outcome, result: newGame.status, profit, lossAmount, serverSeed, clientSeed, currency });
    } catch (error) {
        console.log(error);
        return res.status(400).json({ status: false });
    }
};


const handleBalance = (userId: string, currency: string, amount: number, type: string) => {
    console.log("roulette game", userId, currency, amount, type);
}