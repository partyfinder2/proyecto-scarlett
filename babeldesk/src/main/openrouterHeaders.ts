/** Identidad en OpenRouter Activity (Top Apps / Top API Keys). */
export type BabelDeskOpenRouterWorker = "copy" | "watermark" | "week-plan" | "test" | "pv-tourist";

export function openRouterHeaders(worker: BabelDeskOpenRouterWorker): Record<string, string> {
  return {
    "HTTP-Referer": "http://127.0.0.1/babeldesk",
    "X-Title": `BabelDesk|${worker}`,
  };
}
