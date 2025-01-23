import { Request, Response, Router } from "express";
import { onCreateBet } from "../controllers/roulette";

const router = Router();

// router.get("/game", fetchGame)
router.post("/create", onCreateBet);

export default router;
