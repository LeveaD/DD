/**
 * Vercel Serverless Function Entrypoint — DisputeDefend AI
 *
 * Source of truth: backend/src/api/app.ts
 *
 * Exposes the existing Express application to Vercel's Node.js serverless runtime.
 * Delegates all routing, validation, deterministic engine processing, and error handling
 * directly to the pre-existing Express application instance.
 */

import { createApp } from "../backend/src/api/app.js";

const app = createApp();

export default app;
