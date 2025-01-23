import { Server, Socket } from "socket.io";
import { CrashGame } from "../models";
import { Schema } from "mongoose";
import {
  generatePrivateSeedHashPair,
  generateCrashRandom,
  getPublicSeed,
} from "./random";
import { Request, Response } from "express";

enum GAME_STATUS {
  WAITTING,
  PLAYING,
  GAMEOVER,
}

interface Player {
  playerID: string;
  name: string;
  avatar?: string;
  crashPoint: number;
  betAmount: number;
  currencyId: string;
}

const growthFunc = (ms: number): number =>
  Math.floor(100 * Math.pow(Math.E, 0.0001 * ms));
const inverseGrowth = (result: number): number =>
  16666.666667 * Math.log(0.01 * result);

// Calculate the current game payout
const calculateGamePayout = (ms: number): number => {
  const gamePayout = Math.floor(100 * growthFunc(ms)) / 100;
  return Math.max(gamePayout, 1);
};

const RESTART_WAIT_TIME = 6000;
const START_WAIT_TIME = 4000;
const TICK_RATE = 150;

class CrashEngine {
  game_status: GAME_STATUS = GAME_STATUS.WAITTING;
  players: Player[] = [];
  pending: Player[] = [];
  multiplier = 1.0; // Start at 1x

  crashPoint: number = 1; // Current multiplier at which the game is running
  baseCrashRate: number = 0.005; // Base probability of the game crashing
  profitScalingFactor: number = 0.1; // Factor to scale crash probability based on profit
  highRiskPlayerThreshold: number = 1000; // Threshold to categorize players as high-risk

  maxBet: number = 100;
  minBet: number = 1;
  maxProfit: number = 15000;
  minProfit: number = 1000;
  wattingTime: number = 10000;
  overDelayTime: number = 500;
  statustime: number = 0;
  fps: number = 1000 / 30;
  io: Server;
  totalProfit: number = 0;
  loseProfit: number = 0;
  gameId: Schema.Types.ObjectId | any;
  active: boolean = true;
  privateSeed: string = "";
  privateHash: string = "";
  publicSeed: string | null = "";
  startedAt: Date = new Date();
  duration: number = 0;
  at: number = 0;
  constructor(_io: any) {
    this.io = _io;
    this.statustime = Date.now();

    this.refundGames(() => {
      this.handleStatus(GAME_STATUS.WAITTING);
    });
  }

  // Handle refunds of old unfinished games
  async refundGames(callback: Function) {
    const games = await CrashGame.find({ status: "BET" });
    for (const game of games) {
      try {
        for (let i = 0; i < game.players.length; i++) {
          const bet = game.players[i];

          if (bet.status == "BET") {
            // Push Player ID to the refunded players
            game.players[i].status = "REFUND";
            // Update local wallet
            this.updateBalance(
              bet.playerID,
              bet.betAmount,
              bet.currencyId,
              "crash-refund"
            );
          }
        }
        game.status = "REFUND";

        await game.save();
      } catch (error) {
        console.log(error);
      }
    }
    callback();
  }

  handleStatus(status: GAME_STATUS) {
    switch (status) {
      case GAME_STATUS.WAITTING:
        this.initGame();
        break;
      case GAME_STATUS.PLAYING:
        this.startGame();
        break;
      case GAME_STATUS.GAMEOVER:
        setTimeout(() => {
          this.handleStatus(GAME_STATUS.WAITTING);
        }, START_WAIT_TIME);
        break;
    }
    this.game_status = status;
  }

  // Init the gamemode
  async initGame() {
    const provablyData = generatePrivateSeedHashPair();

    if (!provablyData) {
      return;
    }

    this.privateSeed = provablyData.seed;
    this.privateHash = provablyData.hash;

    this.crashPoint = 1;
    this.players = [...this.pending];
    this.pending = [];
    this.io.emit(
      "game-bets",
      this.players.map((p) => [
        {
          playerID: p.playerID,
          name: p.name,
          betAmount: p.betAmount,
          currencyId: p.currencyId,
        },
      ])
    );

    const game = new CrashGame({
      privateSeed: this.privateSeed,
      privateHash: this.privateHash,
      players: this.players.map((p) => ({
        playerID: p.playerID,
        betAmount: p.betAmount,
        currencyId: p.currencyId,
        status: "BET",
      })),
      crashPoint: 1,
      startedAt: new Date(),
      status: "BET",
    });

    await game.save();
    if (game._id) {
      this.gameId = game._id;
    }

    this.players.forEach((p) => {
      this.updateBalance(p.playerID, -p.betAmount, p.currencyId, "game-bets");
    });

    this.io.emit("game-starting", {
      _id: this.gameId,
      privateHash: this.privateHash,
      timeUntilStart: RESTART_WAIT_TIME,
    });

    setTimeout(() => {
      this.handleStatus(GAME_STATUS.PLAYING);
    }, RESTART_WAIT_TIME - 500);
  }

  async startGame() {
    console.log("New game running...")
    // Get a new public seed from blockchain
    const publicSeed = await getPublicSeed();

    // Generate random data
    const randomData = await generateCrashRandom(this.privateSeed, publicSeed);
    if (!randomData) {
      return;
    }

    this.publicSeed = publicSeed;
    this.crashPoint = randomData?.crashPoint;
    this.duration = Math.ceil(inverseGrowth(this.crashPoint + 1));
    this.startedAt = new Date();

    await CrashGame.updateOne(
      { _id: this.gameId },
      {
        publicSeed: this.publicSeed,
        crashPoint: this.crashPoint / 100,
        players: this.players.map((p) => ({
          playerID: p.playerID,
          betAmount: p.betAmount,
          currencyId: p.currencyId,
          status: "BET",
        })),
        startedAt: new Date(),
      }
    );

    // Emiting start to clients
    this.io.emit("game-start", {
      publicSeed: this.publicSeed,
    });

    this.callTick(0);
  }

  // Calculate next tick time
  callTick(elapsed: number) {
    // Calculate next tick
    const left = this.duration - elapsed;
    const nextTick = Math.max(0, Math.min(left, TICK_RATE));
    setTimeout(() => {
      this.runTick();
    }, nextTick);
  }

  // Run the current tick
  runTick = (): void => {
    // Calculate elapsed time
    const elapsed =
      new Date().valueOf() - new Date(this.startedAt || Date.now()).valueOf();
    const at = growthFunc(elapsed);
    this.at = at;
    // Completing all auto cashouts
    this.runCashOuts(at);

    // Check if crash point is reached
    if (at > this.crashPoint) {
      // this.io.emit("game-tick", this.crashPoint / 100);
      this.gameOver();
    } else {
      this.tick(elapsed);
    }
  };

  // Emits game tick to client
  tick(elapsed: number) {
    this.io.emit("game-tick", calculateGamePayout(elapsed) / 100);
    this.callTick(elapsed);
  }

  /**
   * Main game loop to check if the game should crash or continue.
   * This method increases the crash point and determines if the game should end.
   */
  runCashOuts(elapsed: number) {
    // Check if any players should cash out based on the current crash point
    this.players = this.players.filter((bet) => {
      if (
        bet.crashPoint >= 101 &&
        bet.crashPoint <= elapsed &&
        bet.crashPoint <= this.crashPoint
      ) {
        this.winPlayer(bet, bet.crashPoint);
        return false
      }
      return true
    })
  }

  async gameOver() {
    if (this.gameId) {
      this.players = this.players.filter((player) => {
        this.lossPlayer(player);
        return false;
      });
      await CrashGame.updateOne(
        { _id: this.gameId },
        {
          status: "END",
          publicSeed: this.publicSeed,
        }
      );
    }
    console.log("Game end...")
    this.io.emit("game-end", {
      game: {
        _id: this.gameId,
        createdAt: this.startedAt,
        privateSeed: this.privateSeed,
        publicSeed: this.publicSeed,
        crashPoint: this.crashPoint / 100,
      },
    });

    this.handleStatus(GAME_STATUS.GAMEOVER);
  }

  bet(
    playerID: string,
    betAmount: number,
    currencyId: string,
    crashPoint: number,
    socket: Socket,
    avatar?: string | undefined,
  ) {
    if (!this.checkbalance(playerID, betAmount, currencyId))
      return socket.emit("game-join-error", { msg: "Enough balance" });
    if (this.game_status === GAME_STATUS.WAITTING) {
      this.players.push({
        playerID,
        name: playerID,
        avatar,
        betAmount,
        currencyId,
        crashPoint,
      });
      this.updateBalance(playerID, -betAmount, currencyId, "game-bets");
      this.io.emit("game-bets", [
        {
          playerID,
          name: playerID,
          betAmount,
          avatar,
          currencyId,
          stoppedAt: 0,
          target: crashPoint / 100
        },
      ]);
      socket.emit("game-join-success", {
        playerID,
        name: playerID,
        betAmount,
        avatar,
        currencyId,
        stoppedAt: 0,
      });
    } else {
      const index = this.pending.findIndex((p) => p.playerID === playerID);
      if (index !== -1)
        return socket.emit("game-join-error", { msg: "Already Joined" });
      this.pending.push({
        playerID,
        name: playerID,
        avatar,
        betAmount,
        currencyId,
        crashPoint,
      });
      socket.emit("game-join-success", {
        playerID,
        name: playerID,
        avatar,
        betAmount,
        currencyId,
        crashPoint,
      });
    }
  }

  cancelBet(playerID: string, socket: Socket) {
    const index = this.pending.findIndex((p) => p.playerID === playerID);
    if (index !== -1) {
      this.pending.splice(index, 1);
      socket.emit("game-cancel-success");
    } else {
      socket.emit("game-cancel-error");
    }
  }

  cashout(playerID: string, socket: Socket) {
    if (this.game_status !== GAME_STATUS.PLAYING)
      return socket.emit("bet-cashout-error");
    const index = this.players.findIndex((p) => p.playerID === playerID);
    if (index === -1) return;
    this.winPlayer({ ...this.players[index] }, this.at);

    this.players.splice(index, 1);

    socket.emit("bet-cashout-success");
  }

  checkbalance(playerID: string, betAmount: number, currencyId: string) {
    return true;
  }

  async winPlayer(player: Player, crashPoint: number) {

    this.updateBalance(
      player.playerID,
      player.betAmount * (crashPoint / 100),
      player.currencyId,
      "crash-settled"
    );

    this.io.emit("bet-cashout", [
      {
        playerID: player.playerID,
        name: player.playerID,
        avatar: player.avatar,
        betAmount: player.betAmount,
        currencyId: player.currencyId,
        stoppedAt: crashPoint,
      },
    ]);

    this.loseProfit += player.betAmount;

    const game = await CrashGame.findById(this.gameId);
    if (game) {
      game.players = game.players.map((p) => {
        if (p.status === "BET" && p.playerID == player.playerID) {
          return { ...p, status: "WIN", crashPoint: crashPoint };
        } else {
          return p;
        }
      });
      await game.save();
    }
    console.log("Winner-->", player, crashPoint);
  }

  async lossPlayer(player: Player) {
    this.totalProfit += player.betAmount;
    let game = await CrashGame.findById(this.gameId);
    console.log("losss", game)
    if (game) {
      game.players = game.players.map((p) => {
        console.log("LLLLLLL", p)
        if (p.status === "BET" && p.playerID === player.playerID) {
          return { ...p, status: "LOSS", crashPoint: player.crashPoint / 100 };
        } else {
          return p;
        }
      });

      // Reload the document to get the latest version before saving
      await game.save();
    }
    console.log("Loss", player, this.crashPoint);
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

export const initServer = (io: Server) => {
  let so = io.of("/crashx");
  const GameEngine = new CrashEngine(so);
  so.on("connection", (socket: Socket) => {
    let playerID = socket.id;

    socket.on("auth", async (token: string) => {
      console.log(token);
    });

    socket.on("join-game", async (target: number, betbetAmount: number, currencyId: string) => {
      GameEngine.bet(playerID, betbetAmount, currencyId, target, socket, undefined);
    });

    socket.on("cancel-game", () => {
      GameEngine.cancelBet(playerID, socket);
    });

    socket.on("bet-cashout", async () => {
      GameEngine.cashout(playerID, socket);
    });

    socket.on("games", async () => {

      const history = await CrashGame.find({ status: { $ne: "BET" } }).sort({ createdAt: -1 }).limit(10).select({
        _id: 1,
        startedAt: 1,
        privateSeed: 1,
        publicSeed: 1,
        crashPoint: 1,
      })

      socket.emit("games", {
        _id: GameEngine.gameId,
        privateSeed: GameEngine.privateSeed,
        publicSeed: GameEngine.publicSeed,
        players: GameEngine.players.map((p) => [
          {
            playerID: p.playerID,
            name: p.name,
            avatar: p.avatar,
            betAmount: p.betAmount,
            currencyId: p.currencyId,
            target: p.crashPoint
          },
        ]),
        history: history,
        elapsed:
          Date.now() - new Date(GameEngine.startedAt || Date.now()).valueOf(),
        status:
          GameEngine.game_status == GAME_STATUS.WAITTING
            ? 2
            : GameEngine.game_status == GAME_STATUS.PLAYING
              ? 3
              : 4,
      });
    });
  });
};



export const getGame = async (req: Request, res: Response) => {
  try {
    const gameId = req.params.id;
    const game = await CrashGame.findById(gameId).select({ _id: 1, status: 0 });
    if (game && game?.status !== "BET") {
      res.status(200).json({
        _id: game._id,
        players: game.players.map((p) => {
          console.log(p)
          return {
            playerID: p.playerID, // mongoose.Types.ObjectId[];
            // name: "",
            betAmount: p.betAmount,
            currencyId: p.currencyId, // mongoose.Types.ObjectId[];
            target: p.crashPoint,
            stoppedAt: p.status == "WIN" ? p.crashPoint : 0,
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
    const history = await CrashGame.find({ status: { $ne: "BET" } }).sort({ createdAt: -1 }).skip(skip).limit(limit).select({
      _id: 1,
      startedAt: 1,
      privateSeed: 1,
      publicSeed: 1,
      crashPoint: 1,
    })
    res.status(200).json(history)
  } catch (error) {
    res.status(400).json(error)
  }
}