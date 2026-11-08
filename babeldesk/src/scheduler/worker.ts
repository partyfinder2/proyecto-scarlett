import crypto from "node:crypto";
import type Database from "better-sqlite3";
import {
  ContentLevel,
  Network,
  PublishInput,
  TargetStatus,
  getSkipReason,
  isSchedulerAutoNetwork,
  requiresManualAssist,
} from "../shared/types";
import {
  getDueTargets,
  getPost,
  getAccount,
  getMedia,
  updateTargetStatus,
  log,
  decryptToken,
  DbPostTarget,
} from "../main/db";
import { publishToFacebookPage } from "../connectors/metaPage";
import { publishToInstagram } from "../connectors/instagram";
import { publishToTikTok } from "../connectors/tiktok";
import { assistFacebookGroup, GroupAssistDeps } from "../connectors/groupAssist";
import { assistTikTok } from "../connectors/assistTiktok";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_S = [60, 300, 900];

export type WorkerDeps = {
  db: Database.Database;
  assistDeps: GroupAssistDeps;
  onStatusChange?: (targetId: string, status: TargetStatus) => void;
  /** v1 personal: TikTok por assist. Poner TIKTOK_USE_API=1 para API. */
  tiktokUseApi?: boolean;
};

export async function runSchedulerTick(deps: WorkerDeps): Promise<void> {
  const targets = getDueTargets(deps.db);
  if (targets.length === 0) return;
  log(deps.db, "info", `[scheduler] ${targets.length} target(s) API`);
  for (const target of targets) {
    await processTarget(target, deps, false);
  }
}

/** Assist manual: un target de grupo o TikTok (no corre en cron). */
export async function runManualAssistTarget(
  targetId: string,
  deps: WorkerDeps
): Promise<{ ok: boolean; error?: string }> {
  const row = deps.db.prepare("SELECT * FROM post_targets WHERE id = ?").get(targetId) as
    | DbPostTarget
    | undefined;
  if (!row) return { ok: false, error: "Target no encontrado" };
  await processTarget(row, deps, true);
  return { ok: true };
}

async function processTarget(
  target: DbPostTarget,
  deps: WorkerDeps,
  manualAssist: boolean
): Promise<void> {
  const { db } = deps;
  const { id: targetId, post_id, account_id, attempt } = target;

  const post = getPost(db, post_id);
  if (!post) {
    updateTargetStatus(db, targetId, "failed", { error: "Post no encontrado", attempt });
    return;
  }

  const account = getAccount(db, account_id);
  if (!account) {
    updateTargetStatus(db, targetId, "failed", { error: "Cuenta no encontrada", attempt });
    return;
  }

  const network = account.network as Network;
  const level = post.level as ContentLevel;

  const skip = getSkipReason(network, level);
  if (skip) {
    updateTargetStatus(db, targetId, "skipped", { error: skip, attempt });
    deps.onStatusChange?.(targetId, "skipped");
    return;
  }

  if (requiresManualAssist(network)) {
    if (!manualAssist) return;
    await handleManualAssist(target, post, account, deps);
    return;
  }

  if (!isSchedulerAutoNetwork(network)) {
    updateTargetStatus(db, targetId, "failed", { error: `Red no programable: ${network}`, attempt });
    return;
  }

  let token: string;
  try {
    if (!account.access_token_enc) throw new Error("Sin token");
    token = decryptToken(account.access_token_enc);
  } catch (e) {
    updateTargetStatus(db, targetId, "failed", {
      error: `Token: ${String(e)}. Reconecta en Cuentas.`,
      attempt: attempt + 1,
    });
    return;
  }

  const media = post.media_id ? getMedia(db, post.media_id) : null;
  const caption = target.caption_override ?? post.caption_default;
  const accountTyped = accountRowToPublishAccount(account);

  const input: PublishInput = {
    account: accountTyped,
    post: postRowToStudioPost(post),
    caption,
    mediaPublicUrl: media?.public_url ?? undefined,
    mediaLocalPath: media?.path ?? undefined,
    scheduledAt: target.scheduled_at ?? undefined,
  };

  updateTargetStatus(db, targetId, "publishing", { attempt: attempt + 1 });
  deps.onStatusChange?.(targetId, "publishing");

  try {
    let result;
    if (network === "facebook_page") {
      result = await publishToFacebookPage(input, token);
    } else if (network === "instagram") {
      result = await publishToInstagram(input, token);
    } else if (network === "tiktok" && deps.tiktokUseApi) {
      result = await publishToTikTok(input, token);
    } else {
      result = { ok: false, status: "failed" as TargetStatus, error: "Red no soportada" };
    }

    if (result.ok) {
      updateTargetStatus(db, targetId, result.status, {
        external_post_id: result.externalId,
        attempt: attempt + 1,
      });
      log(db, "info", `target ${targetId} → ${result.status}`, targetId);
      deps.onStatusChange?.(targetId, result.status);
    } else {
      await handleFailure(db, target, result.error ?? "Error desconocido", deps);
    }
  } catch (err) {
    await handleFailure(db, target, String(err), deps);
  }
}

async function handleManualAssist(
  target: DbPostTarget,
  post: NonNullable<ReturnType<typeof getPost>>,
  account: NonNullable<ReturnType<typeof getAccount>>,
  deps: WorkerDeps
): Promise<void> {
  const { db } = deps;
  const network = account.network as Network;
  const caption = target.caption_override ?? post.caption_default;
  const input: PublishInput = {
    account: accountRowToPublishAccount(account),
    post: postRowToStudioPost(post),
    caption,
    mediaLocalPath: post.media_id ? getMedia(db, post.media_id)?.path : undefined,
  };

  updateTargetStatus(db, target.id, "publishing");
  let r;
  if (network === "facebook_group") {
    r = await assistFacebookGroup(input, deps.assistDeps);
  } else {
    r = await assistTikTok(input, deps.assistDeps);
  }
  updateTargetStatus(db, target.id, r.status, { error: r.error });
  log(db, "info", `assist ${network} → ${r.status}`, target.id);
  deps.onStatusChange?.(target.id, r.status);
}

async function handleFailure(
  db: Database.Database,
  target: DbPostTarget,
  error: string,
  deps: WorkerDeps
): Promise<void> {
  const nextAttempt = target.attempt + 1;
  if (nextAttempt >= MAX_ATTEMPTS) {
    updateTargetStatus(db, target.id, "failed", {
      error: `[${nextAttempt}/${MAX_ATTEMPTS}] ${error}`,
      attempt: nextAttempt,
    });
    deps.onStatusChange?.(target.id, "failed");
  } else {
    const backoff = RETRY_BACKOFF_S[nextAttempt - 1] ?? 900;
    const retryAt = Math.floor(Date.now() / 1000) + backoff;
    db.prepare(`
      UPDATE post_targets SET status='queued', attempt=?, scheduled_at=?, error=?
      WHERE id=?
    `).run(nextAttempt, retryAt, `[retry ${nextAttempt}] ${error}`, target.id);
    log(db, "warn", `retry ${nextAttempt} en ${backoff}s: ${error}`, target.id);
    deps.onStatusChange?.(target.id, "queued");
  }
}

export function queuePostNow(db: Database.Database, postId: string, accountIds: string[]): void {
  const now = Math.floor(Date.now() / 1000);
  for (const accountId of accountIds) {
    const targetId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO post_targets (id, post_id, account_id, status, attempt, scheduled_at)
      VALUES (?, ?, ?, 'queued', 0, ?)
    `).run(targetId, postId, accountId, now);
  }
}

function accountRowToPublishAccount(account: NonNullable<ReturnType<typeof getAccount>>) {
  return {
    id: account.id,
    network: account.network as Network,
    displayName: account.display_name ?? "",
    externalId: account.external_id ?? "",
    tokenExpiresAt: account.token_expires_at ?? undefined,
    meta: account.meta_json ? JSON.parse(account.meta_json) : {},
  };
}

function postRowToStudioPost(post: NonNullable<ReturnType<typeof getPost>>) {
  return {
    id: post.id,
    title: post.title ?? "",
    mediaId: post.media_id ?? undefined,
    captionDefault: post.caption_default,
    linkUrl: post.link_url ?? undefined,
    level: post.level as ContentLevel,
  };
}
