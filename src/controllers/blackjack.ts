import { Request, Response } from "express";
import * as crypto from "crypto";
import { Games } from "../models";

type Card = { suit: string; rank: string };
type Hand = Card[];
type Deck = Card[];

const STATUS = {
  win: "Player wins! Dealer busts.",
  lose: "Dealer wins! Player busts.",
  draw: "It's a tie!",
  continue: "Player continues.",
  insuance: "Dealer has blackjack! Insurance paid 2:1.",
  notInsurance: "No blackjack. Insurance bet lost.",
};
const suits: string[] = ["Hearts", "Diamonds", "Clubs", "Spades"];
const ranks: string[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const values: { [key: string]: number } = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 10,
  Q: 10,
  K: 10,
  A: 11, // Aces can be worth 1 or 11
};

function createDeck(): Deck {
  return suits.flatMap((suit) => ranks.map((rank) => ({ suit, rank })));
}

const generateSeed = () => crypto.randomBytes(32).toString("hex");

// PRNG using combined seeds (client + server)
function generateCardIndex(
  seed: string,
  cardPosition: number,
  deckSize: number
): number {
  const combinedSeed = seed + cardPosition; // Combine seed with the card position
  const hash = crypto.createHash("sha256").update(combinedSeed).digest("hex");
  const numericValue = parseInt(hash.slice(0, 8), 16); // Convert part of the hash to a number
  return numericValue % deckSize; // Use modulo to fit within the desired range
}

// Function to deal a unique card using dynamic deck and seeds
function getUniqueCard(
  deck: Deck,
  clientSeed: string,
  serverSeed: string,
  cardPosition: number
): Card {
  const seed = clientSeed + serverSeed; // Combine seeds
  const cardIndex = generateCardIndex(seed, cardPosition, deck.length); // Get card index based on seed
  const card = deck[cardIndex]; // Fetch card at this position
  deck.splice(cardIndex, 1); // Remove the card from the deck to avoid duplicates
  return card; // Return the card
}

function calculateHandValue(hand: Hand): number {
  let total = 0;
  let aces = 0;

  hand.forEach((card) => {
    if (card.rank === "A") {
      aces += 1;
      total += 11; // Initially count Ace as 11
    } else {
      total += values[card.rank];
    }
  });

  while (total > 21 && aces > 0) {
    total -= 10; // Count Ace as 1 instead of 11
    aces--;
  }

  return total;
}

function checkForBlackjack(hand: Hand): boolean {
  return calculateHandValue(hand) === 21;
}

function determineWinner(playerHand: Hand, dealerHand: Hand): { result: string, multiplier: number } {
  const playerValue = calculateHandValue(playerHand);
  const dealerValue = calculateHandValue(dealerHand);
  let result = STATUS.draw;
  if (playerValue > 21) result = STATUS.lose;
  else if (dealerValue > 21) result = STATUS.win;
  else if (playerValue > dealerValue) result = STATUS.win;
  else if (dealerValue > playerValue) result = STATUS.lose;
  return { result: result, multiplier: result === STATUS.win ? playerValue === 21 ? 2.5 : 2 : result === STATUS.draw ? 1 : 0 };
}

export const hitBet = async (req: Request, res: Response) => {
  try {
    const game = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: "BET",
    });
    if (!game) {
      return res.json({ result: "Create new game." });
    }

    const { playerHand, dealerHand, playerHand2 } = game.betting;

    let deck = createDeck();

    const filterUsedCards = (deck: Card[], cards: Hand) => {
      return deck.filter((card) => {
        return !cards.some(
          (handCard) =>
            handCard.rank === card.rank && handCard.suit === card.suit
        );
      });
    };

    const filteredDeck = filterUsedCards(deck, [
      ...playerHand,
      ...dealerHand,
      ...playerHand2,
    ]);

    playerHand.push({
      ...getUniqueCard(
        filteredDeck,
        game.betting.clientSeed,
        game.betting.serverSeed,
        playerHand.length + dealerHand.length + playerHand2.length
      ),
      type: "hit",
    });

    const handValue = calculateHandValue(playerHand);

    if (handValue > 21) {
      if (playerHand2.length) {
        await Games.findOneAndUpdate(
          { _id: game._id }, // Find the document by gameId
          {
            $set: {
              "betting.playerHand": playerHand2,
              "betting.playerHand2": [],
            },
          } // Update the playerHand
        );
        return res.json({
          result: STATUS.continue,
          playerHand: playerHand,
          handValue: handValue,
          switched: true, // Assuming splitting isn't allowed after hitting
        });
      } else {
        await Games.findOneAndUpdate(
          { _id: game._id }, // Find the document by gameId
          { $set: { "betting.playerHand": playerHand, status: "LOST" } } // Update the playerHand
        );
        return res.json({
          result: STATUS.lose,
          playerHand,
          handValue,
          dealerHand,
          dealerValue: calculateHandValue(dealerHand),
          clientSeed: game.betting.clientSeed,
          serverSeed: game.betting.serverSeed,
        });
      }
    }
    await Games.findOneAndUpdate(
      { _id: game._id }, // Find the document by gameId
      { $set: { "betting.playerHand": playerHand } } // Update the playerHand
    );
    return res.json({
      result: STATUS.continue,
      playerHand,
      handValue,
      canSplit: false, // Assuming splitting isn't allowed after hitting
    });
  } catch (err) {
    console.log("hitbet error", err);
  }
};

export const standBet = async (req: Request, res: Response) => {
  try {
    const game = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: "BET",
    });
    if (!game) {
      return res.json({ result: "Create new game." });
    }
    const { playerHand, dealerHand } = game.betting;
    let deck = createDeck();

    const filterUsedCards = (
      deck: Card[],
      playerHand: Hand,
      dealerHand: Hand
    ) => {
      return deck.filter((card) => {
        return ![...playerHand, ...dealerHand].some(
          (handCard) =>
            handCard.rank === card.rank && handCard.suit === card.suit
        );
      });
    };

    let dealerValue = calculateHandValue(dealerHand);
    while (dealerValue < 17) {
      const filteredDeck = filterUsedCards(deck, playerHand, dealerHand);
      dealerHand.push(
        getUniqueCard(
          filteredDeck,
          game.betting.clientSeed,
          game.betting.serverSeed,
          playerHand.length + dealerHand.length
        )
      );
      dealerValue = calculateHandValue(dealerHand);
    }

    const { result, multiplier } = determineWinner(playerHand, dealerHand);

    switch (result) {
      case STATUS.win:
        await Games.findOneAndUpdate(
          { _id: game._id }, // Find the document by gameId
          {
            $set: {
              "betting.dealerHand": dealerHand,
              profit: game.amount * multiplier,
              odds: multiplier,
              status: "WIN",
            },
          } // Update the playerHand
        );
        handleBalance(game.userId, game.currency, game.amount * multiplier, "WIN");
        break;
      case STATUS.lose:
        await Games.findOneAndUpdate(
          { _id: game._id }, // Find the document by gameId
          {
            $set: {
              "betting.dealerHand": dealerHand,
              status: "LOST",
            },
          } // Update the playerHand
        );
        break;
      case STATUS.draw:
        await Games.findOneAndUpdate(
          { _id: game._id }, // Find the document by gameId
          {
            $set: {
              "betting.dealerHand": dealerHand,
              odds: 1,
              status: "DRAW",
            },
          } // Update the playerHand
        );
        handleBalance(game.userId, game.currency, game.amount, "DRAW");
        break;
    }

    res.json({
      result, dealerHand, dealerValue, multiplier,
      clientSeed: game.betting.clientSeed,
      serverSeed: game.betting.serverSeed,
    });
  } catch (err) {
    console.log("standbet error", err);
  }
};

export const doubleBet = async (req: Request, res: Response) => {
  try {
    const game = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: "BET",
    });
    if (!game) {
      return res.json({ result: "Create new game." });
    }

    const { playerHand, dealerHand } = game.betting;
    let deck = createDeck();

    const filterUsedCards = (
      deck: Card[],
      playerHand: Hand,
      dealerHand: Hand
    ) => {
      return deck.filter((card) => {
        return ![...playerHand, ...dealerHand].some(
          (handCard) =>
            handCard.rank === card.rank && handCard.suit === card.suit
        );
      });
    };
    const filteredDeck = filterUsedCards(deck, playerHand, dealerHand);

    playerHand.push({
      ...getUniqueCard(
        filteredDeck,
        game.betting.clientSeed,
        game.betting.serverSeed,
        playerHand.length + dealerHand.length
      ),
      type: "double",
    });

    const handValue = calculateHandValue(playerHand);
    if (!handleBalance(game.userId, game.currency, -game.amount, "BET")) {
      return res.json({ result: "The amount is insufficient." });
    }


    if (handValue > 21) {
      game.status = "LOST";
      await Games.findOneAndUpdate(
        { _id: game._id }, // Find the document by gameId
        {
          $set: {
            "betting.playerHand": playerHand,
            amount: game.amount * 2,
            status: "LOST",
          },
        } // Update the playerHand
      );
      res.json({
        result: STATUS.lose,
        playerHand,
        handValue,
        clientSeed: game.betting.clientSeed,
        serverSeed: game.betting.serverSeed,
      });
    } else {
      await Games.findOneAndUpdate(
        { _id: game._id }, // Find the document by gameId
        {
          $set: {
            "betting.playerHand": playerHand,
            amount: game.amount * 2,
          },
        } // Update the playerHand
      );
      res.json({
        result: "Player stands after double down.",
        playerHand,
        handValue,
      });
    }
  } catch (err) {
    console.log("doublebet error", err);
  }
};

export const splitBet = async (req: Request, res: Response) => {
  try {
    const game = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: "BET",
    });
    if (!game) {
      return res.json({ result: "Create new game." });
    }

    let playerHand = game.betting.playerHand;
    const dealerHand = game.betting.dealerHand;

    let deck = createDeck();

    if (playerHand[0].rank !== playerHand[1].rank) {
      return res.json({
        error: "You can only split if you have two cards of the same rank.",
      });
    }

    const filterUsedCards = (
      deck: Card[],
      playerHand: Hand,
      dealerHand: Hand
    ) => {
      return deck.filter((card) => {
        return ![...playerHand, ...dealerHand].some(
          (handCard) =>
            handCard.rank === card.rank && handCard.suit === card.suit
        );
      });
    };

    let filteredDeck = filterUsedCards(deck, playerHand, dealerHand);

    playerHand = [
      game.betting.playerHand[0],
      {
        ...getUniqueCard(
          filteredDeck,
          game.betting.clientSeed,
          game.betting.serverSeed,
          playerHand.length + dealerHand.length
        ),
        type: "split",
      },
    ];

    filteredDeck = filterUsedCards(deck, playerHand, dealerHand);
    const playerHand2 = [
      game.betting.playerHand[1],
      {
        ...getUniqueCard(
          filteredDeck,
          game.betting.clientSeed,
          game.betting.serverSeed,
          playerHand.length + dealerHand.length
        ),
        type: "split",
      },
    ];

    await Games.findOneAndUpdate(
      { _id: game._id }, // Find the document by gameId
      {
        $set: {
          "betting.playerHand": playerHand,
          "betting.playerHand2": playerHand2,
        },
      } // Update the playerHand
    );

    const hand1Value = calculateHandValue(playerHand);
    const hand2Value = calculateHandValue(playerHand2);

    res.json({
      hand1: { cards: playerHand, value: hand1Value },
      hand2: { cards: playerHand2, value: hand2Value },
    });
  } catch (err) {
    console.log("splitbet error", err);
  }
};

export const createBet = async (req: Request, res: Response) => {
  try {
    const { amount, currency, clientSeed: _clientSeed } = req.body;

    // Helper function to handle blackjack scenarios and game result updates
    const handleBlackjackOutcome = async (
      game: any,
      playerHand: Hand,
      playerHand2: Hand,
      dealerHand: Hand
    ) => {
      const { result, multiplier } = determineWinner(playerHand, dealerHand);
      game.odds = multiplier;
      switch (result) {
        case STATUS.win:
          game.betting.profit = game.betting.amount * multiplier;
          game.status = "WIN";
          handleBalance(game.userId, game.currency, game.betting.profit, game.status);
          break;
        case STATUS.lose:
          game.status = "LOST";
          break;
        case STATUS.draw:
          game.status = "DRAW";
          handleBalance(game.userId, game.currency, game.betting.amount, game.status);
          break;
      }
      await game.save();
      return res.json({
        result,
        multiplier,
        playerHand,
        dealerHand,
        playerValue: calculateHandValue(playerHand),
        playerValue2: calculateHandValue(playerHand2),
        dealerValue: calculateHandValue(dealerHand),
        clientSeed: game.betting.clientSeed,
        serverSeed: game.betting.serverSeed,
      });
    };

    // Check if there's an existing game for this user
    let game = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: "BET",
    });

    const previouseGame = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: { $ne: "BET" },
    }).sort({ _id: -1 });

    if (game) {
      const { playerHand, dealerHand, playerHand2 } = game.betting;
      const playerHasBlackjack = checkForBlackjack(playerHand);
      const dealerHasBlackjack = checkForBlackjack(dealerHand);

      // Handle blackjack outcome if either player or dealer has blackjack
      if (
        playerHasBlackjack ||
        (dealerHasBlackjack && dealerHand[0].rank !== "A")
      ) {
        return handleBlackjackOutcome(
          game,
          playerHand,
          playerHand2,
          dealerHand
        );
      }

      // Respond with current game status
      return res.json({
        result: STATUS.continue,
        amount: game.amount,
        currency: game.currency,
        playerHand,
        dealerHand: [dealerHand[0], { suit: "", rank: "" }],
        canDouble: true,
        canSplit:
          playerHand[0].rank === playerHand[1].rank && playerHand.length === 2,
        clientSeed: game.betting.clientSeed,
        serverSeedHash: crypto
          .createHash("sha256")
          .update(game.betting.serverSeed)
          .digest("hex"),
        previouseServerSeed: previouseGame?.betting?.serverSeed,
        previouseClientSeed: previouseGame?.betting?.clientSeed,
        playerValue: calculateHandValue(playerHand),
        playerValue2: calculateHandValue(playerHand2),
        dealerValue: calculateHandValue([dealerHand[0]]),
      });
    }

    // No existing game, create a new one
    const serverSeed = generateSeed();
    const clientSeed = _clientSeed || generateSeed();
    let deck = createDeck();
    let cardPosition = 0;

    const dealerHand: Hand = [
      getUniqueCard(deck, clientSeed, serverSeed, cardPosition++),
      getUniqueCard(deck, clientSeed, serverSeed, cardPosition++),
    ];

    const playerHand: Hand = [
      getUniqueCard(deck, clientSeed, serverSeed, cardPosition++),
      getUniqueCard(deck, clientSeed, serverSeed, cardPosition++),
    ];

    // Create new game object
    const newGame = new Games({
      userId: "",
      currency: currency,
      odds: 0,
      amount,
      profit: 0,
      gameId: "blackjack",
      betting: {
        serverSeed,
        clientSeed,
        playerHand,
        dealerHand,
        playerHand2: [],
      },
      status: "BET",
    });

    await newGame.save();

    if (!handleBalance(newGame.userId, newGame.currency, -newGame.amount, newGame.status)) {
      return res.json({ result: "The amount is insufficient." });
    }

    const playerHasBlackjack = checkForBlackjack(playerHand);
    const dealerHasBlackjack = checkForBlackjack(dealerHand);

    // Handle blackjack outcome if either player or dealer has blackjack in the new game
    if (
      playerHasBlackjack ||
      (dealerHasBlackjack && dealerHand[0].rank !== "A")
    ) {
      return handleBlackjackOutcome(newGame, playerHand, [], dealerHand);
    }

    // Respond with new game status
    return res.json({
      result: STATUS.continue,
      amount,
      currency,
      playerHand,
      dealerHand: [dealerHand[0], { suit: "", rank: "" }],
      clientSeed,
      serverSeedHash: crypto
        .createHash("sha256")
        .update(serverSeed)
        .digest("hex"),
      previouseServerSeed: previouseGame?.betting?.serverSeed,
      previouseClientSeed: previouseGame?.betting?.clientSeed,
      canDouble: true, // Double down is allowed
      canSplit: playerHand[0].rank === playerHand[1].rank, // Split allowed if first two cards are the same
      playerValue: calculateHandValue(playerHand),
      playerValue2: calculateHandValue([]),
      dealerValue: calculateHandValue([dealerHand[0]]),
    });
  } catch (err) {
    console.log("createbet error", err);
  }
};

// Insurance logic for when dealer shows an Ace
export const insuranceBet = async (req: Request, res: Response) => {
  try {
    const { confirm } = req.body;
    const game = await Games.findOne({
      userId: "",
      gameId: "blackjack",
      status: "BET",
    });
    if (!game) {
      return res.json({ result: "Create new game." });
    }

    const dealerHand = game.betting.dealerHand;

    if (dealerHand[0].rank !== "A") {
      return res.json({
        error: "Insurance is only available when dealer shows an Ace.",
      });
    }

    const dealerValue = calculateHandValue(dealerHand);

    if (confirm)
      game.amount /= 2;

    if (dealerValue === 21) {
      game.profit = confirm ? game.amount * 2 : 0;
      game.odds = confirm ? 1 : 0;
      game.status = confirm ? "WIN" : "LOST";
      await game.save();
      res.json({
        result: STATUS.insuance,
        dealerHand,
        dealerValue,
        clientSeed: game.betting.clientSeed,
        serverSeed: game.betting.serverSeed,
      });
      if (confirm)
        handleBalance(game.userId, game.currency, game.amount, game.status);
    } else {
      await game.save();
      res.json({ result: STATUS.notInsurance, dealerHand, dealerValue });
    }
  } catch (err) {
    console.log("Insurance error", err);
  }
};


const handleBalance = (userId: string, currency: string, amount: number, type: string) => {
  console.log("blackjack game", userId, currency, amount, type);
  return true;
}
