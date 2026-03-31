import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "./api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startWorkbench(portfolioDir: string, port: number = 3200) {
  const { app } = createApi(portfolioDir);

  // Serve static UI files
  // In dev: src/workbench/ui/  In dist: we copy them
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
  });

  return server;
}
