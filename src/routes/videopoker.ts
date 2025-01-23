import * as express from 'express';
import { gameInit, gameDraw, fetchGame } from "../controllers/videopoker";
const router = express.Router();

router.post('/fetchgame', fetchGame)
router.post('/init', gameInit);
router.post('/draw', gameDraw);

export default router;