import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import "../worker/worker";

import { connectDB } from "../config/db";
import { documentQueue } from "../worker/queue";
import routes from "./routes/routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Middlewares
app.use(
  cors({
    origin: true, // Dynamically allow any origin
    credentials: false,
    exposedHeaders: ["X-Sources"],
  }),
);
app.use(express.json());

// 2. Setup Bull-Board (Queue Dashboard)
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(documentQueue)],
  serverAdapter: serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.use("/api", routes);

// Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Something went wrong!" });
});

// 3. Connect DB & Start Server
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Queue Dashboard: http://localhost:${PORT}/admin/queues`);
  });
};

startServer();
