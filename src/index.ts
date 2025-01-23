import "dotenv/config";
import * as express from "express";
import mongoose from "mongoose";
import routers from "./routes";
import * as cors from "cors";
import { initServer } from "./controllers/crash";
import { initSlider } from "./controllers/slide";
import { initBaccarat } from "./controllers/baccarat";
import * as compression from "compression";
const config = require("../config");

const { MONGO_URI, PORT } = config;
const app = express();

app.use(express.json());
app.use(compression());
app.use(express.static(`${config.DIR}/public`));

app.use(
  cors({
    origin: "*", // Allow only your frontend URL
    methods: ["GET", "POST", "PUT", "DELETE"], // Add other methods if needed
    credentials: true, // If you want to allow credentials (cookies, authorization headers, etc.)
  })
);

// Routes
app.use("/api", routers);

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");

    const server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
    const io = require("socket.io")(server, { cors: { origin: "*" } });
    initServer(io);
    initSlider(io);
    initBaccarat(io);
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB", err);
  });
