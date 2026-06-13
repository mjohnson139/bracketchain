// Stage runtime assets into app/public so Vite serves them in dev and copies
// them into the built site/. Both are gitignored build artifacts:
//   - sql-wasm.wasm : the sql.js WebAssembly engine (from node_modules)
//   - state/*       : the deterministic snapshot (game.sqlite, roots.json)
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "app", "public");
mkdirSync(publicDir, { recursive: true });

const wasm = join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
if (!existsSync(wasm)) {
  console.error("sql-wasm.wasm not found — run `npm ci` first.");
  process.exit(1);
}
cpSync(wasm, join(publicDir, "sql-wasm.wasm"));

const stateSrc = join(root, "state");
const stateDst = join(publicDir, "state");
rmSync(stateDst, { recursive: true, force: true });
if (existsSync(join(stateSrc, "game.sqlite"))) {
  cpSync(stateSrc, stateDst, { recursive: true });
} else {
  console.warn("state/game.sqlite not found — run `npm run build:state` first.");
}

console.log("Staged assets into app/public (sql-wasm.wasm, state/).");
