import { resolve } from "node:path";
import { startWorkbench } from "../../workbench/server.js";

export async function workbenchCommand(opts: { dir: string; port?: string }): Promise<void> {
  const dir = resolve(opts.dir);
  const port = opts.port ? parseInt(opts.port) : 3200;
  startWorkbench(dir, port);
}
