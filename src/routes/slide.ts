import { Router } from "express";
import {
    getGame,
    getGames
} from "../controllers/slide";
const router = Router();

// Define routes
router.get("/game/:id", getGame);
router.get("/games", getGames);

export default router;
