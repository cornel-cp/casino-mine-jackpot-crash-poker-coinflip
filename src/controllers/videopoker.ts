import { Request, Response } from "express";
import { VideoPoker } from "../models"
import * as crypto from 'crypto';

interface deckType { rank: string, suit: string }
// Utility functions for deck operations
const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Function to create a new deck
function createDeck() {
    let deck: deckType[] = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}

// Function to evaluate the player's hand
function evaluateHand(hand: deckType[]) {
    const rankCounts = getRankCounts(hand);
    const isFlush = checkFlush(hand);
    const isStraight = checkStraight(rankCounts);
    const uniqueRanks = Object.keys(rankCounts).length;

    if (isFlush && isStraight && checkRoyalFlush(hand)) {
        return 'royal_flush'; // Ace-high straight and flush
    }
    if (isFlush && isStraight) {
        return 'straight_flush'; // Any other straight flush
    }
    if (Object.values(rankCounts).includes(4)) {
        return '4_of_a_kind'; // Four cards of the same rank
    }
    if (Object.values(rankCounts).includes(3) && Object.values(rankCounts).includes(2)) {
        return 'full_house'; // Three of one rank and two of another
    }
    if (isFlush) {
        return 'flush'; // All cards have the same suit
    }
    if (isStraight) {
        return 'straight'; // Five consecutive ranks
    }
    if (Object.values(rankCounts).includes(3)) {
        return '3_of_a_kind'; // Three cards of the same rank
    }
    if (Object.values(rankCounts).filter(count => count === 2).length === 2) {
        return '2_pair'; // Two pairs of cards of the same rank
    }
    if (Object.values(rankCounts).includes(2)) {
        const highPairRanks = ['J', 'Q', 'K', 'A'];
        const hasHighPair = hand.some(card => rankCounts[card.rank] === 2 && highPairRanks.includes(card.rank));
        return hasHighPair ? 'pair' : 'high_card'; // Only return 'pair' if Jacks or Better, otherwise high card
    }
    return 'high_card'; // None of the above
}


// Helper function to check for Royal Flush (A, K, Q, J, 10 of the same suit)
function checkRoyalFlush(hand: deckType[]) {
    const royalRanks = ['A', 'K', 'Q', 'J', '10'];
    const handRanks = hand.map(card => card.rank);
    return royalRanks.every(rank => handRanks.includes(rank));
}

// Payout table based on hand rank
export const payoutTable = [
    { id: "royal_flush", odds: 800, name: "Royal Flush" },
    { id: "straight_flush", odds: 60, name: "Straight Flush" },
    { id: "4_of_a_kind", odds: 22, name: "4 of a Kind" },
    { id: "full_house", odds: 9, name: "Full House" },
    { id: "flush", odds: 6, name: "Flush" },
    { id: "straight", odds: 4, name: "Straight" },
    { id: "3_of_a_kind", odds: 3, name: "3 of a Kind" },
    { id: "2_pair", odds: 2, name: "2 Pair" },
    { id: "pair", odds: 1, name: "Pair of JACKS or Better" },
    { id: "high_card", odds: 0, name: "High Card" }// No payout for high card
];


function generateSeed() {
    return crypto.randomBytes(32).toString('hex');
}

function hashSeed(seed: string): string {
    return crypto.createHash('sha256').update(seed).digest('hex');
}

// Function to calculate the payout based on the hand and bet
function calculatePayout(hand: deckType[], bet: number) {
    const handRank = evaluateHand(hand);

    // Special case for 'Pair' payout
    if (handRank === 'pair') {
        const rankCounts = getRankCounts(hand);
        const highPair = ['J', 'Q', 'K', 'A'].some(rank => rankCounts[rank] === 2);
        if (!highPair) {
            return 0; // Only pay for 'Jacks or Better'
        }
    }

    return bet * (payoutTable.find((item) => item.id === handRank)?.odds || 0);
}

// Helper functions for evaluating hands
function getRankCounts(hand: deckType[]) {
    const counts: any = {};
    for (let card of hand) {
        counts[card.rank] = (counts[card.rank] || 0) + 1;
    }
    return counts;
}

// Check if the hand is a flush (all cards have the same suit)
function checkFlush(hand: deckType[]) {
    const firstSuit = hand[0].suit;
    return hand.every(card => card.suit === firstSuit);
}

// Check if the hand is a straight (all cards are consecutive)
function checkStraight(rankCounts: any) {
    const rankIndexes = RANKS.map(rank => rankCounts[rank] ? 1 : 0);

    // Check for standard straights  
    for (let i = 0; i <= rankIndexes.length - 5; i++) {
        if (rankIndexes.slice(i, i + 5).every(count => count === 1)) {
            return true;
        }
    }

    // Special case for Ace-low straight (A, 2, 3, 4, 5)  
    const isAceLowStraight = rankCounts['A'] && rankCounts['2'] && rankCounts['3'] && rankCounts['4'] && rankCounts['5'];
    return isAceLowStraight;
}


// Function to start a new game
function startNewGame(hash: string): { deck: any, hand: any } {
    const deck: deckType[] = createDeck();
    return dealHand(deck, hash);
}

// Function to deal a hand of 5 cards
function dealHand(deck: deckType[], combinedHash: string, leng: number = 5) {
    const hand: deckType[] = [];
    const startIndex = parseInt(combinedHash.slice(0, 8), 16) % deck.length;

    for (let i = 0; i < leng; i++) {
        const index = (startIndex + i) % deck.length;
        hand.push(deck.splice(index, 1)[0]);
    }

    return { hand, deck };
}

// Function to handle player's decision to hold cards and draw new ones
function drawCards(_deck: deckType[], hand: deckType[], holdIndexes: number[], hash: string) {
    for (let i = 0; i < hand.length; i++) {
        if (!holdIndexes.includes(i) && hand[i] && _deck.length > 0) {
            // Pop a card from the deck
            const { hand: hand1, deck } = dealHand(_deck, hash, 1);

            if (hand1.length) {
                hand[i] = hand1[0];
            } else {
                // Handle the case where no card is available (deck was empty)
                console.error("No card available to assign to hand.");
            }
        }
    }
    return hand;
}


export const gameInit = async (req: Request, res: Response) => {
    const { betAmount, currencyId = "" } = req.body;
    const playerID = "";

    const game = await VideoPoker.findOne({ status: "BET" });
    if (game) {
        res.json({ hand: game.hand });
    } else {
        const serverSeed = generateSeed();
        const clientSeed = generateSeed();
        const hashedServerSeed = hashSeed(serverSeed);
        const combinedHash = hashSeed(serverSeed + clientSeed);
        const currentGame = startNewGame(combinedHash);

        const game = new VideoPoker({
            privateSeed: serverSeed,
            privateHash: hashedServerSeed,
            publicSeed: clientSeed,
            playerID: "",
            betAmount: betAmount,
            currencyId: currencyId,
            deck: currentGame.deck,
            hand: currentGame.hand,
            status: "BET",
        });
        await game.save();
        res.json({ hand: currentGame.hand, clientSeed, hashedServerSeed });
    }
};

export const gameDraw = async (req: Request, res: Response) => {
    const { holdIndexes } = req.body;
    const game = await VideoPoker.findOne({ status: "BET" });
    if (game) {
        const combinedHash = hashSeed(game.privateSeed + game.publicSeed);

        game.hand = drawCards(game.deck, game.hand, holdIndexes, combinedHash);
        const result = evaluateHand(game.hand);
        game.status = "END";
        await game.save();
        return res.json({
            hand: game.hand, result,
            payout: calculatePayout(game.hand, game.betAmount),
            privateSeed: game.privateSeed
        });
    }
    return res.status(400).json({ status: false, msg: "Wrong game" })
};

export const fetchGame = async (req: Request, res: Response) => {
    const game = await VideoPoker.findOne({ status: "BET" });
    if (game) {
        res.json({ hand: game.hand });
    } else {
        res.status(400).json({ status: false, msg: "empty" })
    }
}