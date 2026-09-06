/**
 * Express Application Factory — Milestone 7
 *
 * Source of truth: docs/PRD.md §2 & §3, docs/ARCHITECTURE.md, Milestone 7 §1–§19
 *
 * Configures Express application with:
 *   - CORS for local React development (FRONTEND_ORIGIN or http://localhost:5173)
 *   - JSON request parsing
 *   - REST API router mounted at /api
 *   - 404 Unknown Route handler
 *   - Centralized 500 Error handler (fails closed, suppresses stack traces)
 */

import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { DemoDisputeStore } from "./store.js";
import { createRouter } from "./routes.js";

export function createApp(store?: DemoDisputeStore): Express {
  const app = express();
  const disputeStore = store ?? new DemoDisputeStore();

  // 1. CORS Configuration for local React development and Vercel same-origin
  const allowedOrigin = process.env.FRONTEND_ORIGIN || (process.env.VERCEL ? true : "http://localhost:5173");
  app.use(
    cors({
      origin: allowedOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // 2. JSON Request Body Parser
  app.use(express.json());

  // 3. API Router Mount (supports both direct /api mount and serverless rewrite mount)
  const router = createRouter(disputeStore);
  app.use("/api", router);
  app.use(router);

  // 4. 404 Unknown Route Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
    });
  });

  // 5. Centralized Error Handler (suppresses internal stack traces)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An internal server error occurred",
        ...(process.env.NODE_ENV === "test" ? { detail } : {}),
      },
    });
  });

  return app;
}
