import { Request, Response, Router } from "express";
import {
  autoBetPlace,
  betPlace,
  cashOut,
  checkActiveStatus,
  createMineGame,
} from "../controllers/mine";
const router = Router();

// Define routes
router.post("/status", checkActiveStatus);

router.post("/create", createMineGame);

router.post("/bet", betPlace);

router.post("/autobet", autoBetPlace);

router.post("/cashout", cashOut);

export default router;
