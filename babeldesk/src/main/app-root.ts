import { app } from "electron";
import path from "node:path";

/** Carpeta donde viven data/, Inbox/ y .env (junto al .exe si está empaquetado). */
export function babelDeskRoot(): string {
  return app.isPackaged ? path.dirname(process.execPath) : process.cwd();
}
