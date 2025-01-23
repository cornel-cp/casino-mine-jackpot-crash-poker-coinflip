import { Server, Socket } from "socket.io";
import * as crypto from 'crypto';
import { BaccaratGame } from "../models/Games/baccarat";

// Types and Constants
type Suit = 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

interface Card {
    suit: Suit;
    rank: Rank;
}

const suits: Suit[] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

type Chip = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const chipValues = [1, 10, 100, 1000, 10000, 100000, 1000000];
const ratio = 1000000;
type Place = 'Player' | 'Banker' | 'Tie' | 'PPair' | 'BPair';

// House Edge: Adjusted multipliers
const multipliers = {
    'Player': 1.94,  // 1.94 instead of 2.0
    'Banker': 1.89,  // 1.89 instead of 1.95
    'Tie': 8.74,     // 8.74 instead of 9.0
    'PPair': 11.65,  // 11.65 instead of 12.0
    'BPair': 11.65   // 11.65 instead of 12.0
};

type Bet = {
    place: Place;
    chip: Chip;
    third: boolean;
    currencyId: string
}

type Player = {
    PlayerID: string,
    bets: Bet[]
}

enum GAME_STATUS {
    WAITING,
    STARTING,
    BETTING,
    THIRD_CARD_BETTING, // New state for third card betting
    PLAYING,
    SETTLEMENT
}

class GameEngine {
    bets = new Map<string, Player>();

    playerHand: Card[] = [];
    bankerHand: Card[] = [];
    io: Server;
    status: GAME_STATUS = GAME_STATUS.WAITING;
    deck: Card[] = [];
    THIRD_CARD_DELAY = 1000;
    RESTART_DELAY = 1000;
    BETTING_DELAY = 9000;
    SETTLEMENT_DELAY = 9000;

    DT: number;

    serverSeed: string = "";
    combinedHash: string = "";
    hashedServerSeed: string = "";
    clientSeed: string = "";
    gameId: any;
    constructor(io: any) {
        this.io = io;
        this.handleStatus(GAME_STATUS.STARTING);
        this.DT = Date.now();
    }

    private generateSeed(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    private hashSeed(seed: string): string {
        return crypto.createHash('sha256').update(seed).digest('hex');
    }

    private handleStatus(status: GAME_STATUS) {
        this.status = status;
        this.DT = Date.now();
        this.io.emit("game-status", { status: this.status, dt: this.DT });
        console.log(this.DT, GAME_STATUS[this.status]);
        switch (status) {
            case GAME_STATUS.WAITING:
                break;
            case GAME_STATUS.STARTING:
                this.startNewRound();
                break;
            case GAME_STATUS.THIRD_CARD_BETTING:
            case GAME_STATUS.BETTING:
                this.delayStatus();
                break;
            case GAME_STATUS.PLAYING:
                this.playGame();
                break;
            case GAME_STATUS.SETTLEMENT:
                this.delayStatus();
                break;
            default:
                this.handleStatus(GAME_STATUS.WAITING);
                break;
        }
    }

    private delayStatus() {
        switch (this.status) {
            case GAME_STATUS.WAITING:
                break;
            case GAME_STATUS.STARTING:
                setTimeout(() => {
                    this.handleStatus(GAME_STATUS.BETTING);
                }, this.RESTART_DELAY);
                break;
            case GAME_STATUS.BETTING:
            case GAME_STATUS.THIRD_CARD_BETTING:
                setTimeout(() => {
                    this.handleStatus(GAME_STATUS.PLAYING);
                }, this.BETTING_DELAY);
                break;
            case GAME_STATUS.PLAYING:
                break;
            case GAME_STATUS.SETTLEMENT:
                setTimeout(() => {
                    this.handleStatus(GAME_STATUS.STARTING);
                }, this.SETTLEMENT_DELAY)
                break;
            default:
                this.handleStatus(GAME_STATUS.WAITING);
                break;
        }
    }

    private async startNewRound() {
        this.deck = [];
        this.playerHand = [];
        this.bankerHand = [];
        this.gameId = undefined;
        this.bets.clear();
        this.delayStatus();

        this.serverSeed = this.generateSeed();
        this.clientSeed = this.generateSeed();
        this.hashedServerSeed = this.hashSeed(this.serverSeed);
        this.combinedHash = this.hashSeed(this.serverSeed + this.clientSeed);
        const newGame = new BaccaratGame({
            privateSeed: this.serverSeed,
            publicSeed: this.clientSeed,
            playerHand: [],
            bankerHand: [],
            bets: [],
            status: "BET"
        });

        this.gameId = newGame._id;
        await newGame.save()

        // Send the hashed seed to all players
        this.io.emit("round-start", { hashedServerSeed: this.hashedServerSeed, clientSeed: this.clientSeed });
    }

    private playGame() {
        if (!this.playerHand.length || !this.bankerHand.length) {
            this.createDeck();
            this.playerHand = this.dealCards(2);
            this.bankerHand = this.dealCards(2);
            this.io.emit("deal-card", { player: this.playerHand, banker: this.bankerHand });
            let playerScore = this.calculateScore(this.playerHand);
            let bankerScore = this.calculateScore(this.bankerHand);

            if (this.shouldPlayerDraw(playerScore)) {
                if (bankerScore < 7) {
                    setTimeout(() => {
                        this.handleStatus(GAME_STATUS.THIRD_CARD_BETTING);
                    }, this.THIRD_CARD_DELAY)
                } else {
                    setTimeout(() => {
                        this.handleStatus(GAME_STATUS.PLAYING);
                    }, this.THIRD_CARD_DELAY);
                }
            } else {
                this.settlement();
            }
        } else if (this.playerHand.length == 2) {
            this.drawCardForPlayer();
        } else if (this.playerHand.length == 3 && this.bankerHand.length == 2) {
            this.drawCardForBanker();
        }
    }

    private createDeck() {
        this.deck = [];
        for (const suit of suits) {
            for (const rank of ranks) {
                this.deck.push({ suit, rank });
            }
        }
    }

    private dealCards(numberOfCards: number): Card[] {
        const hand: Card[] = [];
        const startIndex = parseInt(this.combinedHash.slice(0, 8), 16) % this.deck.length;

        for (let i = 0; i < numberOfCards; i++) {
            const index = (startIndex + i) % this.deck.length;
            hand.push(this.deck.splice(index, 1)[0]);
        }
        return hand;
    }

    private calculateScore(hand: Card[]): number {
        const score = hand.reduce((total, card) => {
            if (card.rank === 'A') return total + 1;
            if (['J', 'Q', 'K', '10'].includes(card.rank)) return total;
            return total + parseInt(card.rank, 10);
        }, 0);

        return score % 10;
    }

    private shouldPlayerDraw(playerScore: number): boolean {
        return playerScore <= 5;
    }

    private shouldBankerDraw(bankerScore: number, playerThirdCard: Card | null): boolean {
        if (bankerScore <= 2) return true;
        if (!playerThirdCard) return false;

        const playerRank = playerThirdCard.rank;
        if (bankerScore === 3 && playerRank !== '8') return true;
        if (bankerScore === 4 && ['2', '3', '4', '5', '6', '7'].includes(playerRank)) return true;
        if (bankerScore === 5 && ['4', '5', '6', '7'].includes(playerRank)) return true;
        if (bankerScore === 6 && ['6', '7'].includes(playerRank)) return true;

        return false;
    }

    private drawCardForPlayer() {
        let playerThirdCard: Card | null = null;
        playerThirdCard = this.dealCards(1)[0];
        this.io.emit("deal-card", { player: [playerThirdCard], banker: [] })

        this.playerHand.push(playerThirdCard);
        let bankerScore = this.calculateScore(this.bankerHand);

        if (this.shouldBankerDraw(bankerScore, playerThirdCard)) {
            let playerScore = this.calculateScore(this.playerHand);

            if (bankerScore < 7 && playerScore > bankerScore) {
                this.handleStatus(GAME_STATUS.THIRD_CARD_BETTING);
            } else {
                setTimeout(() => {
                    this.handleStatus(GAME_STATUS.PLAYING);
                }, this.THIRD_CARD_DELAY)
            }
        } else {
            this.settlement();
        }
    }

    private drawCardForBanker() {
        let bankerThirdCard: Card | null = null;
        bankerThirdCard = this.dealCards(1)[0];
        this.io.emit("deal-card", { player: [], banker: [bankerThirdCard] })
        this.bankerHand.push(bankerThirdCard);
        setTimeout(() => {
            this.settlement();
        }, this.THIRD_CARD_DELAY)
    }

    private isPair(hand: Card[]): boolean {
        return hand.length === 2 && hand[0].rank === hand[1].rank;
    }

    private determineWinner(playerScore: number, bankerScore: number): Place {
        if (playerScore > bankerScore) {
            return 'Player';
        } else if (bankerScore > playerScore) {
            return 'Banker';
        } else {
            return 'Tie';
        }
    }

    private verifyBet(player: Player, chip: Chip): boolean {
        // Check if player has enough balance
        const chipValue = chipValues[chip];

        return true;
    }

    onBet(playerId: string, chip: Chip, place: Place, currencyId: string, socket: Socket) {
        console.log(playerId, chip, place, currencyId)
        if (this.status === GAME_STATUS.BETTING || this.status === GAME_STATUS.THIRD_CARD_BETTING) {
            let player: any = this.bets.get(playerId);

            if (!player || !this.verifyBet(player, chip)) {
                this.bets.set(playerId, {
                    PlayerID: place,
                    bets: [],
                });
                player = this.bets.get(playerId);
                // return socket.emit("bet-res", { status: false, msg: "Insufficient balance or verification failed" });
            }


            player.bets.push({
                place, chip,
                currencyId,
                third: this.status === GAME_STATUS.THIRD_CARD_BETTING
            });

            this.updateBalance(playerId, -chipValues[chip] / ratio, currencyId, "BET");
            socket.emit("bet-res", { status: true, msg: "Bet placed successfully" });
            return this.io.emit("bet", { playerId, chip, place, currencyId })
        }
        return socket.emit("bet-res", { status: false, msg: "Betting phase is over" });

    }


    onCacenlBet(playerId: string, socket: Socket) {
        if (this.status !== GAME_STATUS.BETTING && this.status !== GAME_STATUS.THIRD_CARD_BETTING) return socket.emit("cancelbet-res", { status: false, msg: "game status error" })
        const player = this.bets.get(playerId);

        if (!player)
            return socket.emit("cancelbet-res", { status: false, msg: "verification failed" });
        if (this.status === GAME_STATUS.THIRD_CARD_BETTING) {
            if (player.bets.length && player.bets[player.bets.length - 1].third) {
                this.updateBalance(playerId, chipValues[player.bets[player.bets.length - 1].chip] / ratio, player.bets[player.bets.length - 1].currencyId, "CANCEL");
                player.bets.pop();
                if (!player.bets.length) {
                    this.bets.delete(playerId);
                }
            } else {
                return socket.emit("cancelbet-res", { status: false, msg: "status error" });
            }
        } else if (this.status === GAME_STATUS.BETTING) {
            if (player.bets.length) {
                this.updateBalance(playerId, chipValues[player.bets[player.bets.length - 1].chip] / ratio, player.bets[player.bets.length - 1].currencyId, "CANCEL");
                player.bets.pop();
                if (!player.bets.length) {
                    this.bets.delete(playerId);
                }
            } else {
                return socket.emit("cancelbet-res", { status: false, msg: "status error" });
            }
        }
        this.io.emit("cancelbet", { status: true, player: { playerId } })
    }

    onClearBet(playerId: string, socket: Socket) {
        if (this.status !== GAME_STATUS.BETTING) return socket.emit("cancelbet-res", { status: false, msg: "game status error" })
        const player = this.bets.get(playerId);

        if (!player)
            return socket.emit("clearbet-res", { status: false, msg: "verification failed" });

        for (let i = 0; i < player.bets.length; i++) {
            this.updateBalance(playerId, chipValues[player.bets[i].chip] / ratio, player.bets[i].currencyId, "CANCEL");
        }
        this.bets.delete(playerId);
        return this.io.emit("clearbet", { status: true, player: { playerId } });
    }

    private settlement() {
        let playerScore = this.calculateScore(this.playerHand);
        let bankerScore = this.calculateScore(this.bankerHand);
        let winner = this.determineWinner(playerScore, bankerScore);
        let isPlayerPair = this.isPair(this.playerHand);
        let isBankerPair = this.isPair(this.bankerHand);
        console.log({
            playerHand: this.playerHand,
            bankerHand: this.bankerHand,
            winner,
            ppair: isPlayerPair,
            bpair: isBankerPair
        })
        for (let player of this.bets.values()) {
            for (let bet of player.bets) {
                let payout = 0;
                const chipValue = chipValues[bet.chip] / ratio;
                if (bet.place === winner) {
                    payout += chipValue * multipliers[winner];
                    if ((bet.place === 'PPair' && isPlayerPair) || (bet.place === 'BPair' && isBankerPair)) {
                        payout += chipValue * multipliers[bet.place];
                    }
                    if (payout > 0) {
                        this.updateBalance(player.PlayerID, payout, bet.currencyId, "WIN");
                    }
                }
            }
        }

        const bets: Player[] = [];
        for (let [id, bet] of this.bets) {
            bets.push(bet);
        }

        BaccaratGame.findByIdAndUpdate(this.gameId, {
            playerHand: this.playerHand,
            bankerHand: this.bankerHand,
            bets: bets,
            status: "END"
        })

        this.io.emit("result", {
            winner,
            ppair: isPlayerPair,
            bpair: isBankerPair,
            serverSeed: this.serverSeed
        })
        this.handleStatus(GAME_STATUS.SETTLEMENT);


    }

    private updateBalance(playerId: string, amount: number, currencyId: string, type: string) {
        // Update the player's balance in the database or in memory

        // Additional logic to update database records for the transaction can go here
        console.log(playerId, amount, currencyId, type)
    }
}


export const initBaccarat = (io: Server) => {
    let so = io.of("/baccarat");
    const gameEngline = new GameEngine(so);

    so.on("connection", (socket: Socket) => {
        let playerID = socket.id;

        socket.on("auth", async (token: string) => {
            console.log(token);
        });

        socket.on("bet", async (data: { chip: Chip, place: Place, currencyId: string }) => {
            gameEngline.onBet(playerID, data.chip, data.place, data.currencyId, socket);
        });

        socket.on("cancel", () => {
            gameEngline.onCacenlBet(playerID, socket);
        });

        socket.on("clear", async () => {
            gameEngline.onClearBet(playerID, socket);
        });

        socket.on("init", () => {
            socket.emit("game-data", {
                playerId: playerID,
                bets: gameEngline.bets.values(),
                playerHand: gameEngline.playerHand,
                bankerHand: gameEngline.bankerHand,
                status: gameEngline.status,
                THIRD_CARD_DELAY: gameEngline.THIRD_CARD_DELAY,
                RESTART_DELAY: gameEngline.RESTART_DELAY,
                BETTING_DELAY: gameEngline.BETTING_DELAY,
                SETTLEMENT_DELAY: gameEngline.SETTLEMENT_DELAY,
                elapsed: Date.now() - gameEngline.DT,
                hashedServerSeed: gameEngline.hashedServerSeed,
                clientSeed: gameEngline.clientSeed,
                gameId: gameEngline.gameId
            })
        })
    });
}