import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "src", "renderer");
const out = path.join(process.cwd(), "dist", "renderer");
fs.mkdirSync(out, { recursive: true });
for (const name of fs.readdirSync(root)) {
  if (name.endsWith(".html") || name.endsWith(".css") || name.endsWith(".js")) {
    fs.copyFileSync(path.join(root, name), path.join(out, name));
  }
}
