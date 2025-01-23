import { Request, Response } from "express";
import { MineGame } from "../models";
enum MINE_OBJECT {
  HIDDEN = 0,
  GEM = 1,
  BOMB = 2,
}

enum GAME_EVENT {
  WIN,
  LOSS,
}

enum GAME_TYPE {
  MANUAL,
  AUTO,
}
export const checkActiveStatus = async (req: Request, res: Response) => {
  try {
    const result = await MineGame.findOne({ status: "BET" });
    if (result) {
      return res.json({
        success: true,
        datas: result.grid.filter((m) => m.mined),
        amount: result.amount,
        mines: result.mines,
      });
    } else {
      return res.json({
        success: false,
      });
    }
  } catch (error) {
    return res.status(400).json({});
  }
};

export const createMineGame = async (req: Request, res: Response) => {
  try {
    const { mines, amount } = req.body;
    if (mines < 1) {
      return res.status(400).json({});
    }
    const result = await MineGame.findOne({ status: "BET" });
    if (result) {
      return res.json({ status: "END" });
    } else {
      const minesArray = initializeMines(25, mines);
      await MineGame.create({
        mines,
        amount,
        status: "BET",
        grid: minesArray,
      });
      return res.json({ status: "BET" });
    }
  } catch (error) {
    console.log(error);
    return res.status(400).json({});
  }
};

export const betPlace = async (req: Request, res: Response) => {
  try {
    const { point } = req.body;
    const result = await MineGame.findOne({ status: "BET" });
    if (result) {
      const betcount = result.count + 1;
      result.count += 1;
      const index = result.grid.findIndex((m) => m.point === point);
      if (index !== -1) {
        result.grid[index].mined = true;
        if (result.grid[index].mine === MINE_OBJECT.GEM) {
          if (result.grid.findIndex((m) => !m.mined) == -1) {
            await MineGame.findByIdAndUpdate(result._id, {
              status: "END",
              count: betcount,
              grid: result.grid,
            });

            const profitAndOdds = calculateMinesGame(
              result.mines,
              betcount,
              result.amount
            );

            saveBettinResult(
              GAME_EVENT.WIN,
              result.amount,
              profitAndOdds.roundedWinAmount,
              profitAndOdds.probability,
              GAME_TYPE.MANUAL
            );
            return res.json({ status: "END", datas: result.grid });
          } else {
            await result.save();
            return res.json({ status: "BET" });
          }
        } else if (result.grid[index].mine === MINE_OBJECT.BOMB) {
          await MineGame.findByIdAndUpdate(result._id, {
            status: "END",
            count: betcount,
            grid: result.grid,
          });

          const profitAndOdds = calculateMinesGame(
            result.mines,
            betcount,
            result.amount
          );

          saveBettinResult(
            GAME_EVENT.LOSS,
            result.amount,
            -result.amount,
            profitAndOdds.probability,
            GAME_TYPE.MANUAL
          );
          return res.json({ status: "END", datas: result.grid }); // Respond with the updated grid
        }
      }
    }
  } catch (error) {
    console.log(error);
  }
  return res.json({ status: "" });
};

export const autoBetPlace = async (req: Request, res: Response) => {
  try {
    const { points, mines, amount } = req.body;
    const minesArray = initializeMines(25, mines);
    const newGame: {
      mines: number;
      amount: number;
      status: string;
      grid: any[];
    } = {
      mines,
      amount,
      status: "END",
      grid: minesArray,
    };
    let betResult = GAME_EVENT.WIN;
    for (let i = 0; i < points.length; i++) {
      let point = points[i];
      const index = newGame.grid.findIndex((m: any) => m.point === point);
      if (index !== -1) {
        newGame.grid[index].mined = true;
        if (newGame.grid[index].mine == MINE_OBJECT.BOMB) {
          betResult = GAME_EVENT.LOSS;
        }
      }
    }

    const profitAndOdds = calculateMinesGame(mines, points.length, amount);

    saveBettinResult(
      betResult,
      amount,
      betResult == GAME_EVENT.LOSS ? -amount : profitAndOdds.roundedWinAmount,
      profitAndOdds.probability,
      GAME_TYPE.AUTO
    );
    await MineGame.create(newGame);
    return res.json({ status: "END", datas: newGame.grid });
  } catch (error) {
    console.log(error);
    return res.json({ status: "" });
  }
};

export const cashOut = async (req: Request, res: Response) => {
  try {
    const result = await MineGame.findOne({ status: "BET" });
    if (result) {
      const betcount = result.count;
      const profitAndOdds = calculateMinesGame(
        result.mines,
        betcount,
        result.amount
      );

      saveBettinResult(
        GAME_EVENT.WIN,
        result.amount,
        profitAndOdds.roundedWinAmount,
        profitAndOdds.probability,
        GAME_TYPE.MANUAL
      );
      await MineGame.findByIdAndUpdate(result._id, {
        status: "END",
      });
      return res.json({ status: "END", datas: result.grid }); // Respond with the updated grid
    }
  } catch (error) {}
  res.json({});
};

// Function to create an array of mines with random bombs
function initializeMines(
  totalMines: number,
  bombCount: number
): { point: number; mine: MINE_OBJECT }[] {
  // Create an array with default values (hidden)
  const minesArray: { point: number; mine: MINE_OBJECT }[] = Array.from(
    { length: totalMines },
    (_, index) => ({
      point: index,
      mine: MINE_OBJECT.GEM,
      mined: false,
    })
  );

  // Randomly select positions for bombs
  const bombPositions = new Set<number>();
  while (bombPositions.size < bombCount) {
    const randomPosition = Math.floor(Math.random() * totalMines);
    bombPositions.add(randomPosition);
  }

  // Place bombs in the selected positions
  bombPositions.forEach((pos) => {
    minesArray[pos].mine = MINE_OBJECT.BOMB;
  });

  return minesArray;
}

function calculateMinesGame(mines: number, picks: number, bet: number): any {
  const totalSlots = 25; // Total number of slots
  const safeSlots = totalSlots - mines; // Slots without mines

  // Function to calculate factorial
  function factorial(n: number): number {
    let value = 1;
    for (let i = 2; i <= n; i++) {
      value *= i;
    }
    return value;
  }

  // Function to calculate combinations
  function combination(n: number, k: number): number {
    if (k > n) return 0;
    return factorial(n) / (factorial(k) * factorial(n - k));
  }

  // Calculate total combinations and safe combinations
  const totalCombinations = combination(totalSlots, picks);
  const safeCombinations = combination(safeSlots, picks);

  // Calculate probability and other metrics
  let probability = 0.99 * (totalCombinations / safeCombinations);
  probability = Math.round(probability * 100) / 100;

  const winAmount = bet * probability;
  const roundedWinAmount = Math.round(winAmount * 100000000) / 100000000;

  const lossAmount = 100 / (probability - 1);
  const roundedLossAmount = Math.round(lossAmount * 100) / 100;

  const chance = 99 / probability;
  const roundedChance = Math.round(chance * 100000) / 100000;

  // Log results if conditions are met
  if (mines + picks <= totalSlots && picks > 0 && mines > 0) {
    if (mines && picks) {
      return {
        probability,
        roundedLossAmount,
        roundedChance,
        roundedWinAmount,
      };
      // console.log("Probability:", probability);
      // console.log("Loss:", roundedLossAmount);
      // console.log("Chance:", roundedChance);
      // if (bet > 0.00000000999) console.log("Win:", roundedWinAmount);
    }
  }
  return {
    probability: 0,
    roundedLossAmount: 0,
    roundedChance: 0,
    roundedWinAmount: 0,
  };
}

const saveBettinResult = (
  status: GAME_EVENT,
  amount: number,
  profit: number,
  odds: number,
  type: GAME_TYPE
) => {
  console.log(
    "bet=>",
    amount,
    "profit=>",
    profit,
    "odds=>",
    odds,
    "type=>",
    GAME_TYPE[type],
    "status=>",
    GAME_EVENT[status]
  );
};
