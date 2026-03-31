import express from "express";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startWorkbench(portfolioDir: string, port: number = 3200) {
  // Validate directory exists
  if (!existsSync(portfolioDir)) {
    console.error(`Error: Portfolio directory not found: ${portfolioDir}`);
    console.error("Create the directory or check the --dir path.");
    process.exitCode = 1;
    return null;
  }

  const { app } = createApi(portfolioDir);

  // Serve static UI files
  const uiDir = join(__dirname, "ui");
  app.use(express.static(uiDir));
  app.get("/", (_req, res) => {
    res.sendFile(join(uiDir, "index.html"));
  });

  const server = app.listen(port, () => {
    console.log(`Taste Engine Operator Workbench`);
    console.log(`  UI:  http://localhost:${port}`);
    console.log(`  API: http://localhost:${port}/api`);
    console.log(`  Dir: ${portfolioDir}`);
    console.log();
    console.log("Press Ctrl+C to stop.");
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Error: Port ${port} is already in use.`);
      console.error(`Try: taste workbench --dir ${portfolioDir} --port ${port + 1}`);
      process.exitCode = 1;
    } else {
      console.error(`Server error: ${err.message}`);
      process.exitCode = 1;
    }
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
