import { Router } from "express";
import {
    createBet,
    onBet,
    onCashout
} from "../controllers/goal";
const router = Router();

router.post("/create-bet", createBet);
router.post("/bet", onBet);
router.post("/cashout", onCashout);

export default router;
