import { Server, Socket } from "socket.io";
import { SlideGame } from "../models";
import { generateCrashRandom, generatePrivateSeed, generatePrivateSeedHashPair, getPublicSeed } from "./random";
import { Schema } from "mongoose";
import { Request, Response } from "express";


enum STATUS {
    WAITTING,
    STARTING,
    BETTING,
    PLAYING
}

type Player = {
    playerID: string,
    betAmount: number;
    name: string;
    avatar?: string;
    currencyId: string;
    target: number;
    status: string;
}


const STATING_TIME = 1000;
const BETTING_TIME = 20000;
const PLAYING_TIME = 10000;

class GameEngine {
    io: Server;
    status: STATUS;

    players: Player[] = [];

    privateSeed: string = "";
    privateHash: string = "";
    publicSeed: string | null = "";
    crashPoint: number = 1;

    gameId: Schema.Types.ObjectId | any;

    constructor(io: any) {

        SlideGame.find({ status: "BET" }).then((games) => {
            games.forEach((game) => {
                let players = game.players.map((p) => {
                    return {
                        ...p,
                        status: "REFUND"
                    }
                })

                SlideGame.findByIdAndUpdate(game._id, {
                    players,
                    status: "CANCELED"
                })
            })
        });


        this.status = STATUS.WAITTING;
        this.io = io;
        this.handle_status(STATUS.STARTING);
    }

    handle_status(status: STATUS) {
        this.status = status;
        switch (this.status) {
            case STATUS.WAITTING:
                break;
            case STATUS.STARTING:
                this.initGame();
                break;
            case STATUS.BETTING:
                this.startGame();
                break;
            case STATUS.PLAYING:
                this.showResult();
                break;
        };
        console.log("STATUS:", STATUS[this.status])
    }

    joinbet(playerID: string, betAmount: number, avatar: any, name: string, currencyId: string, target: number, socket: Socket) {
        if (this.status === STATUS.BETTING) {
            const index = this.players.findIndex((p) => p.playerID === playerID);
            if (index !== -1) {
                return socket.emit("game-join-error", { msg: "Already Joined" });
            }

            this.players.push({
                playerID,
                betAmount,
                currencyId,
                target,
                avatar,
                name,
                status: "BET"
            });

            socket.emit("bet", [{
                playerID,
                betAmount,
                avatar,
                name,
                currencyId,
                target
            }]);

            this.updateBalance(playerID, betAmount, currencyId, "BET");
            return socket.emit("game-join-sucess", { msg: "success" });

        } else {
            return socket.emit("game-join-error", { msg: "Betting failed" });
        }
    }

    initGame() {
        const provablyData = generatePrivateSeedHashPair();

        if (!provablyData) {
            return;
        }
        this.players = [];
        this.privateSeed = provablyData.seed;
        this.privateHash = provablyData.hash;
        this.io.emit("slide-track", {
            _id: this.gameId,
            crashPoint: this.crashPoint / 100,
            privateHash: this.privateHash,
            publicSeed: this.publicSeed,
            status: STATUS.STARTING,
            players: this.players,
        });
        setTimeout(() => {
            this.handle_status(STATUS.BETTING);
        }, STATING_TIME)
    }

    async startGame() {
        const publicSeed = await getPublicSeed();

        // Generate random data
        const randomData = await generateCrashRandom(this.privateSeed, publicSeed);
        if (!randomData) {
            return;
        }

        this.publicSeed = publicSeed;
        this.crashPoint = randomData?.crashPoint;

        this.io.emit("slide-track", {
            privateHash: this.privateHash,
            publicSeed: this.publicSeed,
            status: STATUS.BETTING,
            players: this.players,
        });


        const game = new SlideGame({
            privateHash: this.privateHash,
            publicSeed: this.publicSeed,
            privateSeed: this.privateSeed,
            players: this.players,
            status: "BET",
            crashPoint: this.crashPoint / 100,
            startedAt: new Date()
        });
        await game.save();
        this.gameId = game._id;

        setTimeout(() => {
            this.handle_status(STATUS.PLAYING);
        }, BETTING_TIME);
    }

    async showResult() {
        const numbers = [];

        for (let i = 0; i < 89; i++) {
            const publicSeed = generatePrivateSeed();
            const randomData = await generateCrashRandom(this.privateSeed, publicSeed);
            numbers.push((randomData?.crashPoint || 100) / 100);
        }

        const players = [];
        for (let i = 0; i < this.players.length; i++) {
            const player: Player = this.players[i];
            if (player.target <= this.crashPoint / 100) {
                this.updateBalance(player.playerID, player.betAmount, player.currencyId, "WIN");
                this.players[i].status = "WIN";
                players.push({ ...this.players[i], stoppedAt: this.players[i].target * 100 })
            } else {
                this.players[i].status = "LOSS";
                players.push({ ...this.players[i] })
            }
        }

        this.io.emit("slide-track", {
            _id: this.gameId,
            privateHash: this.privateHash,
            publicSeed: this.publicSeed,
            status: STATUS.PLAYING,
            players: players,
            crashPoint: this.crashPoint / 100,
            numbers
        })

        const game = await SlideGame.findById(this.gameId);
        if (game) {
            game.players = this.players;
            game.status = "END";
            await game.save();
        }

        setTimeout(() => {
            this.handle_status(STATUS.STARTING);
        }, PLAYING_TIME);
    }


    updateBalance(
        playerID: string,
        betAmount: number,
        currencyId: string,
        type: string
    ) {
        console.log(type, "===>", playerID, betAmount, currencyId);
    }
}


export const initSlider = (io: Server) => {
    let so = io.of("/slide");
    const gameEngine = new GameEngine(so);
    so.on("connection", (socket: Socket) => {
        console.log(socket.id);
        let playerID = socket.id;
        socket.on("auth", (token: string) => {
            // playerID = token;
        });

        socket.on("join-game", async (target: number, betAmount: number, currencyId: string) => {
            console.log('join-game', target)
            gameEngine.joinbet(playerID, betAmount, undefined, playerID, currencyId, Number(target || 0), socket);
        });

        socket.on("games", async () => {

            socket.emit("slide-track", {
                privateHash: gameEngine.privateHash,
                publicSeed: gameEngine.publicSeed,
                status: gameEngine.status,
                players: gameEngine.players,
                crashPoint: gameEngine.crashPoint / 100,
                numbers: []
            });

            const history = await SlideGame.find({ status: { $ne: "BET" } }).sort({ createdAt: -1 }).skip(0).limit(10).select({
                _id: 1,
                startedAt: 1,
                privateSeed: 1,
                publicSeed: 1,
                crashPoint: 1,
            })

            socket.emit("history", history.map((h) => {
                return {
                    _id: h._id,
                    resultpoint: h.crashPoint,
                    startedAt: h.startedAt
                }
            }))

        })

    })
}


export const getGame = async (req: Request, res: Response) => {
    try {
        const gameId = req.params.id;
        const game = await SlideGame.findById(gameId).select({ _id: 1, status: 0 });
        if (game && game?.status !== "BET") {
            res.status(200).json({
                _id: game._id,
                players: game.players.map((p) => {
                    return {
                        playerID: p.playerID, // mongoose.Types.ObjectId[];
                        // name: "",
                        betAmount: p.betAmount,
                        currencyId: p.currencyId, // mongoose.Types.ObjectId[];
                        target: p.target,
                        stoppedAt: p.status == "WIN" ? p.target * 100 : 0,
                        status: p.status
                    }
                }),
                publicSeed: game.publicSeed,
                privateSeed: game.privateSeed,
                crashPoint: game.crashPoint,
                startedAt: game.startedAt
            })
        } else {
            res.status(400).json({
                msg: "The game isn't over yet."
            })
        }
    } catch (error) {
        res.status(400).json(error)
    }
}

export const getGames = async (req: Request, res: Response) => {
    try {
        const { skip = 0, limit = 10 }: { skip?: number, limit?: number } = req.query;
        const history = await SlideGame.find({ status: { $ne: "BET" } }).sort({ createdAt: -1 }).skip(skip).limit(limit).select({
            _id: 1,
            startedAt: 1,
            privateSeed: 1,
            publicSeed: 1,
            crashPoint: 1,
        })
        res.status(200).json(history.map((h) => {
            return {
                _id: h._id,
                crashPoint: h.crashPoint,
                startedAt: h.startedAt
            }
        }))
    } catch (error) {
        res.status(400).json(error)
    }
}