/**
 * Server Entry Point — Milestone 7
 *
 * Starts the Express HTTP server for DisputeDefend backend API.
 */

import { createApp } from "./app.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = createApp();

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`DisputeDefend API Server running on http://localhost:${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/api/health`);
  });
}

export { app };
