import { Request, Response, Router } from "express";
import { onCashOut, onBet, onCreateBet, fetchGame } from "../controllers/hilo";

const router = Router();

router.get("/game", fetchGame)
router.post("/create", onCreateBet);
router.post("/bet", onBet)
router.post("/cashout", onCashOut);

export default router;
