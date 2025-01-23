import { Router } from "express";
import mineRouter from "./mine";
import crashRouter from "./crash";
import slideRouter from "./slide";
import videopoker from "./videopoker";
import hiloRouter from "./hilo";
import goalRouter from "./goal";
import blackJackRouter from "./blackjack";
import rouletteRouter from "./roulette";
const router = Router();

router.use("/mine", mineRouter);
router.use("/crash", crashRouter);
router.use("/slide", slideRouter);
router.use("/video-poker", videopoker);
router.use("/hilo", hiloRouter);
router.use("/goal", goalRouter);
router.use("/blackjack", blackJackRouter);
router.use("/roulette", rouletteRouter);

export default router;
