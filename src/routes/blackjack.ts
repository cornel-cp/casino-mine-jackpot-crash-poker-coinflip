

import { Router } from "express";
import { createBet, doubleBet, hitBet, insuranceBet, splitBet, standBet } from "../controllers/blackjack";
const router = Router();

router.post('/start', createBet);

router.post('/hit', hitBet);

router.post('/stand', standBet);

router.post('/split', splitBet);

router.post('/double', doubleBet);

router.post('/insurance', insuranceBet);

export default router;