import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import {
  SubmissionStatus,
  TransactionType,
  TransactionStatus,
  NotificationType,
} from "@/generated/prisma";
import { processReferralCommissions } from "@/lib/referral-commissions";
import { notifyUser } from "@/lib/notify";
import { getPointsPerUsd } from "@/lib/economy";
import {
  compareUniqueKey,
  type ArticleConfig,
} from "@/lib/article-tasks";
import { hasEngagement, type VideoConfig } from "@/lib/video-tasks";
import {
  validateAnswers as validateSurveyAnswers,
  type SurveyConfig,
  type SurveyAnswers,
} from "@/lib/survey-tasks";
import {
  validateCustomAnswers,
  type CustomConfig,
  type CustomAnswers,
} from "@/lib/custom-tasks";
import {
  effectiveProofItems,
  hasRichProof,
  type AppInstallConfig,
} from "@/lib/app-install-tasks";
import { socialWatchTargetSeconds, normalizeSocialConfig } from "@/lib/social-tasks";
import { verifyCodeFor, contentHasCode } from "@/lib/task-verify-code";
import {
  verifyTelegramMember,
  verifyDiscordMember,
} from "@/lib/social-verify-membership";
import { fetchRawHtml, fetchRawBytes } from "@/lib/link-preview";
import { getSetting } from "@/lib/system-settings";
import { bumpTrust, TRUST_APPROVE } from "@/lib/trust";
import {
  perceptualHash,
  hammingDistance,
  PHASH_HAMMING_THRESHOLD,
} from "@/lib/phash";
import { createHash } from "crypto";

// POST /api/tasks/:id/submit - Submit task proof
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withIdempotency(request, session.user.id, async () => {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      submissionId,
      proof,
      proofImages,
      answers,
      // Actual media length (seconds) reported by the video player, so we can
      // cap the required watch time at the real video length.
      videoDuration,
      uniqueKey: submittedUniqueKey,
      // SOCIAL-only proof fields (sent by social-tasks-view.tsx)
      proofUrl,
      screenshotUrl,
      username,
      generatedContent,
      // SOCIAL bundle: per-action proof array
      // [{action, proofUrl?, screenshotUrl?, username?, generatedContent?}]
      items: socialItems,
      // CUSTOM-only proof field (admin-defined form answers)
      customAnswers,
      // VIDEO YouTube-style engagement confirmations { subscribe?, like?, comment? }
      engagement: videoEngagement,
      // APPINSTALL structured per-requirement proof [{id,kind,label,target,value?}]
      appInstallProof,
    } = body;

    // Get the task
    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Find the pending submission
    const submission = await prisma.taskSubmission.findFirst({
      where: {
        id: submissionId,
        taskId: id,
        userId: session.user.id,
        status: SubmissionStatus.PENDING,
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "No pending submission found. Please start the task first." },
        { status: 400 }
      );
    }

    // Already submitted (still PENDING = awaiting manual review). Block a second
    // submit so a reopened task can't overwrite proof or re-queue it.
    if (submission.submittedAt) {
      return NextResponse.json(
        { error: "You've already submitted this — it's awaiting review." },
        { status: 409 }
      );
    }

    // Check if the required watch time was met.
    // VIDEO tasks are gated on videoConfig.watchSeconds (what the player enforces),
    // NOT task.duration — the two can diverge (duration is often the full video
    // length), which would otherwise make a fully-watched video impossible to submit.
    let requiredSeconds =
      task.type === "VIDEO"
        ? (task.videoConfig as VideoConfig | null)?.watchSeconds ?? task.duration ?? 0
        : task.duration ?? 0;
    // If the real video is SHORTER than the configured watch target, cap the
    // requirement at the actual length — otherwise a fully-watched short video
    // can never satisfy 80% of a longer target.
    if (
      task.type === "VIDEO" &&
      typeof videoDuration === "number" &&
      videoDuration > 0 &&
      videoDuration < requiredSeconds
    ) {
      requiredSeconds = videoDuration;
    }
    // SOCIAL bundles with watch items are gated on SERVER-accrued watch seconds
    // (the /heartbeat route credits only real foreground playback) — the client
    // `watched: true` flag alone can't pass. Non-watch social actions have no
    // time gate here (they're proof-reviewed).
    if (task.type === "SOCIAL") {
      const socialTarget = socialWatchTargetSeconds(task.socialConfig);
      if (socialTarget > 0) {
        const need = Math.floor(socialTarget * 0.8);
        if (submission.watchedSeconds < need) {
          return NextResponse.json(
            {
              error: `Please finish watching. ${need - submission.watchedSeconds} seconds of watch time remaining.`,
            },
            { status: 400 }
          );
        }
      }
    }
    if (requiredSeconds && task.type !== "SOCIAL") {
      const requiredDuration = Math.floor(requiredSeconds * 0.8); // 80% of required time

      // VIDEO tasks are validated against server-accrued watched seconds (the
      // /heartbeat route only credits real, foreground playback), so a client
      // can't satisfy the gate just by waiting. Other timed types fall back to
      // wall-clock elapsed since the submission was started.
      if (task.type === "VIDEO") {
        if (submission.watchedSeconds < requiredDuration) {
          return NextResponse.json(
            {
              error: `Please watch the full video. ${requiredDuration - submission.watchedSeconds} seconds of watch time remaining.`,
            },
            { status: 400 }
          );
        }
      } else {
        const elapsedSeconds = Math.floor(
          (Date.now() - submission.createdAt.getTime()) / 1000
        );
        if (elapsedSeconds < requiredDuration) {
          return NextResponse.json(
            {
              error: `Please complete the task. ${requiredDuration - elapsedSeconds} seconds remaining.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Validate quiz answers if it's a quiz task
    let score: number | null = null;
    if (task.type === "QUIZ" && answers && task.questions) {
      const questions = task.questions as Array<{
        question: string;
        options: string[];
        correctAnswer: number;
      }>;

      let correctCount = 0;
      questions.forEach((q, index) => {
        if (answers[index] === q.correctAnswer) {
          correctCount++;
        }
      });

      score = Math.round((correctCount / questions.length) * 100);
    }

    // ── Article task: check unique key + force PENDING (admin reviews) ──
    let uniqueKeyMismatch = false;
    let claimedArticleKeyId: string | null = null;
    if (task.type === "ARTICLE") {
      const cfg = task.articleConfig as ArticleConfig | null;
      if (cfg?.useKeyPool) {
        // v2 (key-pool) mode: the key MUST exist in the pool, MUST be
        // claimed by this user, and MUST not already be tied to a
        // submission. Atomically bind it to this submission.
        const submitted = String(submittedUniqueKey ?? "").trim();
        if (!submitted) {
          return NextResponse.json(
            { error: "Unique key is required" },
            { status: 400 }
          );
        }
        const keyRow = await prisma.articleTaskKey.findUnique({
          where: { taskId_keyValue: { taskId: task.id, keyValue: submitted } },
          select: {
            id: true,
            claimedByUserId: true,
            submissionId: true,
          },
        });
        if (!keyRow) {
          return NextResponse.json(
            { error: "Invalid key — not found in this task's pool" },
            { status: 400 }
          );
        }
        if (keyRow.submissionId) {
          return NextResponse.json(
            { error: "This key has already been submitted" },
            { status: 400 }
          );
        }
        if (
          keyRow.claimedByUserId &&
          keyRow.claimedByUserId !== session.user.id
        ) {
          return NextResponse.json(
            { error: "This key was claimed by another user" },
            { status: 400 }
          );
        }
        // Atomic bind: only claim if still unclaimed by anyone OR claimed
        // by us. updateMany returns 0 if a race lost — treat as conflict.
        const update = await prisma.articleTaskKey.updateMany({
          where: {
            id: keyRow.id,
            submissionId: null,
            OR: [
              { claimedByUserId: null },
              { claimedByUserId: session.user.id },
            ],
          },
          data: {
            claimedByUserId: session.user.id,
            claimedAt: keyRow.claimedByUserId ? undefined : new Date(),
            submissionId: submission.id,
          },
        });
        if (update.count === 0) {
          return NextResponse.json(
            { error: "Key was just consumed — refresh and try again" },
            { status: 409 }
          );
        }
        claimedArticleKeyId = keyRow.id;
      } else if (cfg?.proofRequirements?.uniqueKey && cfg.uniqueKey) {
        // Legacy single-key mode
        if (!compareUniqueKey(submittedUniqueKey, cfg.uniqueKey)) {
          uniqueKeyMismatch = true;
        }
      }
    }

    // ── Survey task: validate answers against the configured questions ──
    if (task.type === "SURVEY") {
      const cfg = task.surveyConfig as SurveyConfig | null;
      if (!cfg || !Array.isArray(cfg.questions) || cfg.questions.length === 0) {
        return NextResponse.json(
          { error: "Survey is misconfigured" },
          { status: 400 }
        );
      }
      const v = validateSurveyAnswers(cfg, (answers ?? {}) as SurveyAnswers);
      if (!v.ok) {
        return NextResponse.json(
          { error: v.error ?? "Invalid answers", missing: v.missing ?? [] },
          { status: 400 }
        );
      }
    }

    // ── Custom task: validate answers against admin-defined fields ──
    if (task.type === "CUSTOM") {
      const cfg = task.customConfig as CustomConfig | null;
      if (!cfg || !Array.isArray(cfg.fields) || cfg.fields.length === 0) {
        return NextResponse.json(
          { error: "Custom task is misconfigured" },
          { status: 400 }
        );
      }
      const err = validateCustomAnswers(
        cfg,
        (customAnswers ?? {}) as CustomAnswers
      );
      if (err) {
        return NextResponse.json({ error: err }, { status: 400 });
      }
    }

    // ── App-install task: validate each configured proof requirement ──
    // Legacy tasks (no proofItems) fall back to a single required screenshot.
    let appInstallMeta: Record<string, unknown> | null = null;
    if (task.type === "APPINSTALL") {
      const cfg = task.appInstallConfig as AppInstallConfig | null;
      const items = effectiveProofItems(cfg);
      const images: string[] = Array.isArray(proofImages) ? proofImages : [];
      const byId = new Map(
        (Array.isArray(appInstallProof) ? appInstallProof : []).map(
          (p: { id?: string; value?: string }) => [String(p?.id), p]
        )
      );
      // Screenshots arrive in item order (only for items that require one).
      let shotIdx = 0;
      const metaItems: Array<Record<string, unknown>> = [];
      for (const it of items) {
        let imageUrl: string | null = null;
        if (it.screenshot) {
          imageUrl = images[shotIdx] ?? null;
          shotIdx += 1;
          if (!imageUrl) {
            return NextResponse.json(
              { error: `Upload a screenshot for: ${it.label}` },
              { status: 400 }
            );
          }
        }
        const value = byId.get(it.id)?.value?.toString().trim() || null;
        if (it.valueLabel && !value) {
          return NextResponse.json(
            { error: `Please provide: ${it.valueLabel}` },
            { status: 400 }
          );
        }
        metaItems.push({
          id: it.id,
          kind: it.kind,
          label: it.label,
          target: it.target ?? null,
          valueLabel: it.valueLabel ?? null,
          value,
          imageUrl,
        });
      }
      appInstallMeta = { appKind: cfg?.appKind ?? "app", items: metaItems };
    }

    // ── Video task: hard-fail on bad unique key (auto-reject) ──
    if (task.type === "VIDEO") {
      const cfg = task.videoConfig as VideoConfig | null;
      if (cfg?.proofRequirements?.uniqueKey && cfg.uniqueKey) {
        if (!compareUniqueKey(submittedUniqueKey, cfg.uniqueKey)) {
          await prisma.taskSubmission.update({
            where: { id: submission.id },
            data: {
              proof: proof || null,
              proofImages: proofImages || [],
              answers: answers || null,
              status: SubmissionStatus.REJECTED,
              reviewedAt: new Date(),
              rejectionReason: "Incorrect verification key",
            },
          });
          return NextResponse.json(
            {
              status: "rejected",
              error: "Incorrect verification key",
              message:
                "The unique key you submitted didn't match. Please rewatch and try again.",
            },
            { status: 400 }
          );
        }
      }
    }

    // Determine if task should be auto-approved.
    // ARTICLE (legacy) and SURVEY always go to PENDING for admin manual review.
    // ARTICLE (key-pool) auto-approves since the key was atomically verified
    // against the pool — no human review needed.
    // VIDEO and QUIZ may auto-approve.
    // CUSTOM auto-approves only when the admin opted into it via customConfig.autoApprove.
    const isArticleKeyPool =
      task.type === "ARTICLE" && claimedArticleKeyId !== null;
    const customAutoApprove =
      task.type === "CUSTOM" &&
      (task.customConfig as CustomConfig | null)?.autoApprove === true;
    // Auto-approve only simple installs — never when a requirement needs a human
    // to verify a target/typed value.
    const appInstallAutoApprove =
      task.type === "APPINSTALL" &&
      (task.appInstallConfig as AppInstallConfig | null)?.autoApprove === true &&
      !hasRichProof(task.appInstallConfig as AppInstallConfig | null);
    // NOTE: shouldAutoApprove / newStatus are computed AFTER the SOCIAL block
    // below, because social code-verification (socialCodeAutoApprove) is decided
    // there and must feed the auto-approve decision.

    // Tasks assigned to a Task Board don't grant individual rewards. The full
    // reward bundle is paid out only when the user claims the entire board.
    // Submission still flows normally so progress can be tracked; we just
    // record pointsEarned / xpEarned as 0 and skip the credit block.
    const isBoardTask = !!task.boardId;

    // For SOCIAL: map the type-specific POST body fields onto the existing
    // proof/proofImages columns and stash extras (username, AI-generated
    // content) in metadata so the admin panel can render them.
    const isSocial = task.type === "SOCIAL";
    // Bundle submissions send an `items` array (one proof set per action).
    const socialBundle: Array<Record<string, unknown>> | null =
      isSocial && Array.isArray(socialItems) ? socialItems : null;
    const submissionMetadata: Record<string, unknown> = {};
    // True only when EVERY item is a code-verify item and ALL codes were found
    // at their public URLs — then the submission is trustworthy enough to
    // auto-approve without human review.
    let socialCodeAutoApprove = false;
    if (isSocial) {
      if (socialBundle) {
        // Store per-action proof; mirror item[0] into the legacy keys so any
        // lagging consumer still shows something.
        submissionMetadata.items = socialBundle.map((it) => ({
          action: it.action ?? null,
          proofUrl: it.proofUrl ?? null,
          screenshotUrl: it.screenshotUrl ?? null,
          username: it.username ?? null,
          generatedContent: it.generatedContent ?? null,
          watched: it.watched ?? null,
        }));
        submissionMetadata.socialUsername = socialBundle[0]?.username ?? null;
        submissionMetadata.socialGeneratedContent =
          socialBundle[0]?.generatedContent ?? null;
      } else {
        // Legacy single-action submission (old client / in-flight task).
        submissionMetadata.socialUsername = username ?? null;
        submissionMetadata.socialGeneratedContent = generatedContent ?? null;
      }

      // Proof-fraud check: fingerprint each submitted proof value and flag any
      // that a DIFFERENT user already used on this task (recycled screenshots /
      // reused post links / shared usernames). We flag for the reviewer — we do
      // NOT hard-block, since public URLs can legitimately repeat.
      const norm = (v: unknown) =>
        typeof v === "string" ? v.trim().toLowerCase() : "";
      const hash = (v: string) =>
        createHash("sha256").update(v).digest("hex");
      const rawPairs: Array<{ kind: string; raw: string }> = [];
      const pushVal = (kind: string, v: unknown) => {
        const n = norm(v);
        if (n) rawPairs.push({ kind, raw: n });
      };
      if (socialBundle) {
        for (const it of socialBundle) {
          pushVal("URL", it.proofUrl);
          pushVal("SCREENSHOT", it.screenshotUrl);
          pushVal("USERNAME", it.username);
        }
      } else {
        pushVal("USERNAME", username);
      }
      // De-dupe (kind,value) within this submission.
      const seen = new Set<string>();
      const pairs = rawPairs
        .map((p) => ({ ...p, valueHash: hash(p.raw) }))
        .filter((p) => {
          const k = `${p.kind}:${p.valueHash}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      if (pairs.length > 0) {
        const matches = await prisma.socialProofFingerprint.findMany({
          where: {
            taskId: task.id,
            userId: { not: session.user.id },
            OR: pairs.map((p) => ({ kind: p.kind, valueHash: p.valueHash })),
          },
          select: { kind: true, valueHash: true, userId: true },
        });
        if (matches.length > 0) {
          const byHash = new Map(pairs.map((p) => [`${p.kind}:${p.valueHash}`, p.raw]));
          submissionMetadata.fraudFlags = matches.map((m) => ({
            kind: m.kind,
            value: byHash.get(`${m.kind}:${m.valueHash}`) ?? null,
            matchedUserId: m.userId,
          }));
        }
        // Record this submission's fingerprints for future lookups.
        await prisma.socialProofFingerprint.createMany({
          data: pairs.map((p) => ({
            taskId: task.id,
            userId: session.user.id,
            submissionId: submission.id,
            kind: p.kind,
            valueHash: p.valueHash,
          })),
        });
      }

      // Screenshot re-upload dedup: hash the actual image BYTES (not the URL),
      // so the same screenshot re-uploaded under a new S3 URL is still caught.
      const shotUrls = socialBundle
        ? [
            ...new Set(
              socialBundle
                .map((it) => it.screenshotUrl)
                .filter(
                  (u): u is string => typeof u === "string" && !!u.trim()
                )
            ),
          ]
        : [];
      if (shotUrls.length > 0) {
        const byteHashes: string[] = [];
        const phashes: string[] = [];
        for (const url of shotUrls) {
          const bytes = await fetchRawBytes(url);
          if (bytes) {
            byteHashes.push(createHash("sha256").update(bytes).digest("hex"));
            // Perceptual hash too — survives re-encode/crop that dodges sha256.
            const ph = await perceptualHash(bytes);
            if (ph) phashes.push(ph);
          }
        }
        if (byteHashes.length > 0) {
          const shotMatches = await prisma.socialProofFingerprint.findMany({
            where: {
              taskId: task.id,
              kind: "SCREENSHOT_BYTES",
              valueHash: { in: byteHashes },
              userId: { not: session.user.id },
            },
            select: { userId: true },
          });
          if (shotMatches.length > 0) {
            const existing = (submissionMetadata.fraudFlags as
              | Array<Record<string, unknown>>
              | undefined) ?? [];
            submissionMetadata.fraudFlags = [
              ...existing,
              ...shotMatches.map((m) => ({
                kind: "SCREENSHOT",
                value: "re-uploaded image",
                matchedUserId: m.userId,
              })),
            ];
          }
          await prisma.socialProofFingerprint.createMany({
            data: byteHashes.map((h) => ({
              taskId: task.id,
              userId: session.user.id,
              submissionId: submission.id,
              kind: "SCREENSHOT_BYTES",
              valueHash: h,
            })),
          });
        }

        // Perceptual near-duplicate scan. Hamming distance can't be indexed, so
        // we pull a bounded window of this task's recent PHASH fingerprints from
        // OTHER users and compare in-memory (≤ threshold bits differ ⇒ same img).
        if (phashes.length > 0) {
          const priorPhashes = await prisma.socialProofFingerprint.findMany({
            where: {
              taskId: task.id,
              kind: "SCREENSHOT_PHASH",
              userId: { not: session.user.id },
            },
            select: { userId: true, valueHash: true },
            orderBy: { createdAt: "desc" },
            take: 500,
          });
          const near: string[] = [];
          for (const mine of phashes) {
            for (const prior of priorPhashes) {
              if (
                hammingDistance(mine, prior.valueHash) <=
                PHASH_HAMMING_THRESHOLD
              ) {
                near.push(prior.userId);
                break; // one flag per submitted screenshot is enough
              }
            }
          }
          if (near.length > 0) {
            const existing = (submissionMetadata.fraudFlags as
              | Array<Record<string, unknown>>
              | undefined) ?? [];
            submissionMetadata.fraudFlags = [
              ...existing,
              ...near.map((matchedUserId) => ({
                kind: "SCREENSHOT",
                value: "near-duplicate image (perceptual)",
                matchedUserId,
              })),
            ];
          }
          await prisma.socialProofFingerprint.createMany({
            data: phashes.map((h) => ({
              taskId: task.id,
              userId: session.user.id,
              submissionId: submission.id,
              kind: "SCREENSHOT_PHASH",
              valueHash: h,
            })),
          });
        }
      }

      // Server-side auto-verification per item (anti-fake proof). Each method
      // proves the action really happened, so a matching bundle can auto-approve
      // without a fakeable screenshot:
      //   CODE            — fetch the public proof URL, confirm the user's unique
      //                     code is in the content.
      //   TELEGRAM_MEMBER / DISCORD_MEMBER — a bot confirms the linked account
      //                     actually joined the target chat/guild.
      // "verified" → trusted. "failed"/"code_missing" → not verified (manual).
      // "unverifiable" (login wall, fetch/API error, not linked) → manual, never
      // a silent pass. Whole bundle verified → auto-approve.
      if (socialBundle) {
        const cfg = normalizeSocialConfig(task.socialConfig);
        const verifyIdx = cfg.items
          .map((it, i) => ({ it, i }))
          .filter((x) => !!x.it.verify);
        if (verifyIdx.length > 0) {
          const metaItems = submissionMetadata.items as Array<
            Record<string, unknown>
          >;
          // Load the user's verified platform links only if a member check needs them.
          const needsLinks = verifyIdx.some(
            (x) =>
              x.it.verify === "TELEGRAM_MEMBER" ||
              x.it.verify === "DISCORD_MEMBER"
          );
          const linkByPlatform = new Map<string, string>();
          if (needsLinks) {
            const links = await prisma.linkedPlatformAccount.findMany({
              where: { userId: session.user.id },
              select: { platform: true, platformUserId: true },
            });
            links.forEach((l) => linkByPlatform.set(l.platform, l.platformUserId));
          }

          let allVerified = true;
          for (const { it, i } of verifyIdx) {
            let status: "verified" | "failed" | "code_missing" | "unverifiable" =
              "unverifiable";
            if (it.verify === "CODE") {
              const proofUrl =
                (socialBundle[i]?.proofUrl as string | undefined) ?? "";
              const expected = verifyCodeFor(task.id, i, session.user.id);
              if (!proofUrl) status = "code_missing";
              else {
                const html = await fetchRawHtml(proofUrl);
                if (html === null) status = "unverifiable";
                else
                  status = contentHasCode(html, expected)
                    ? "verified"
                    : "code_missing";
              }
            } else if (
              it.verify === "TELEGRAM_MEMBER" ||
              it.verify === "DISCORD_MEMBER"
            ) {
              const platform =
                it.verify === "TELEGRAM_MEMBER" ? "TELEGRAM" : "DISCORD";
              const linkedId = linkByPlatform.get(platform);
              const target = it.fields?.verifyTarget ?? "";
              if (!linkedId) {
                status = "unverifiable";
                if (metaItems[i]) metaItems[i].needsLink = platform;
              } else {
                status =
                  it.verify === "TELEGRAM_MEMBER"
                    ? await verifyTelegramMember(target, linkedId)
                    : await verifyDiscordMember(target, linkedId);
              }
            }
            if (metaItems[i]) metaItems[i].verifyStatus = status;
            if (status !== "verified") allVerified = false;
          }
          // Auto-approve only when EVERY item is auto-verified — a mixed bundle
          // still needs manual review of its non-verified actions.
          socialCodeAutoApprove =
            allVerified && verifyIdx.length === cfg.items.length;
        }
      }
    }
    // For ARTICLE: surface the unique-key mismatch flag so the admin sees
    // it during review (article submissions don't auto-reject on mismatch).
    if (task.type === "ARTICLE" && uniqueKeyMismatch) {
      submissionMetadata.articleUniqueKeyMismatch = true;
      submissionMetadata.articleSubmittedUniqueKey = submittedUniqueKey ?? null;
    }
    // For CUSTOM: stash the admin-defined form answers so the admin review
    // screen can render them next to the task config.
    if (task.type === "CUSTOM" && customAnswers) {
      submissionMetadata.customAnswers = customAnswers;
    }
    // APPINSTALL: store the structured per-requirement proof (label/target/value
    // + screenshot per item) so the reviewer sees labeled proof, not bare images.
    if (appInstallMeta) {
      submissionMetadata.appInstall = appInstallMeta;
    }
    // For PROXY: record the submit IP so the admin fraud surface can verify the
    // user actually browsed through the assigned proxy region.
    if (task.type === "PROXY") {
      const submitIp = (
        request.headers.get("x-forwarded-for")?.split(",")[0] ??
        request.headers.get("x-real-ip") ??
        ""
      ).trim();
      submissionMetadata.submitIp = submitIp || null;
    }
    // For VIDEO with YouTube-style engagement: record which steps the user
    // confirmed so the admin panel can show them.
    if (task.type === "VIDEO" && hasEngagement(task.videoConfig as VideoConfig | null)) {
      submissionMetadata.videoEngagement =
        videoEngagement && typeof videoEngagement === "object"
          ? videoEngagement
          : {};
    }
    // Hard-block duplicate proof (admin opt-in): if this SOCIAL submission
    // matched another user's proof (URL / username / re-uploaded screenshot) and
    // the admin turned blocking on, reject instead of just flagging.
    if (
      isSocial &&
      Array.isArray(submissionMetadata.fraudFlags) &&
      submissionMetadata.fraudFlags.length > 0 &&
      (await getSetting<boolean>("antifraud.block_duplicate_proof", false))
    ) {
      return NextResponse.json(
        {
          error:
            "This proof matches another user's submission. Please complete the task yourself and submit your own proof.",
          code: "DUPLICATE_PROOF",
        },
        { status: 400 }
      );
    }

    // Auto-approve decision (computed here so social code-verification can feed
    // it). SOCIAL auto-approves when the admin set task.autoApprove OR the whole
    // bundle was server-verified by code.
    let shouldAutoApprove =
      !uniqueKeyMismatch &&
      task.type !== "SURVEY" &&
      (isArticleKeyPool ||
        customAutoApprove ||
        appInstallAutoApprove ||
        socialCodeAutoApprove ||
        (task.type !== "ARTICLE" &&
          task.type !== "CUSTOM" &&
          task.type !== "APPINSTALL" &&
          (task.autoApprove || task.type === "VIDEO" || task.type === "QUIZ")));

    // VIDEO YouTube-style engagement that requires a screenshot is manually
    // reviewed (a screenshot only has value if a human checks it). Honor-based
    // engagement (no screenshot) keeps auto-approving, guarded by the trust /
    // spot-check gate below.
    if (
      task.type === "VIDEO" &&
      hasEngagement(task.videoConfig as VideoConfig | null) &&
      (task.videoConfig as VideoConfig | null)?.proofRequirements?.screenshot
    ) {
      shouldAutoApprove = false;
    }

    // Anti-fraud gate: even if the submission qualifies for auto-approval, hold
    // it for MANUAL review when the submitter's trust is below the admin bar, or
    // when it's caught by the random spot-check sample. Keeps auto-approve fast
    // for trusted users while auditing the rest.
    if (shouldAutoApprove) {
      const [minTrust, spotPct] = await Promise.all([
        getSetting<number>("antifraud.auto_approve_min_trust", 0),
        getSetting<number>("antifraud.spot_check_percent", 0),
      ]);
      if (minTrust > 0 || spotPct > 0) {
        const me = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { trustScore: true },
        });
        const lowTrust = minTrust > 0 && (me?.trustScore ?? 0) < minTrust;
        const spotChecked = spotPct > 0 && Math.random() * 100 < spotPct;
        if (lowTrust || spotChecked) {
          shouldAutoApprove = false;
          submissionMetadata.heldForReview = lowTrust ? "low_trust" : "spot_check";
        }
      }
    }

    // Computed after all metadata (incl. heldForReview) is finalized.
    const hasMetadata = Object.keys(submissionMetadata).length > 0;

    const newStatus = shouldAutoApprove
      ? SubmissionStatus.AUTO_APPROVED
      : SubmissionStatus.PENDING;

    const resolvedProof = isSocial
      ? socialBundle
        ? ((socialBundle[0]?.proofUrl as string | undefined) ?? null)
        : (proofUrl ?? null)
      : proof || null;
    const resolvedProofImages = isSocial
      ? socialBundle
        ? socialBundle
            .map((it) => it.screenshotUrl as string | undefined)
            .filter((s): s is string => !!s)
        : screenshotUrl
          ? [screenshotUrl]
          : []
      : proofImages || [];

    // Atomically claim the submission: only the FIRST concurrent submit flips
    // it from PENDING/not-submitted to its new state. Two parallel POSTs (a
    // double-click / client retry) would otherwise both pass the guard above
    // and both run the credit block below — and since Transaction.reference
    // has no unique backstop, the duplicate EARNING would stick (double pay).
    const claim = await prisma.taskSubmission.updateMany({
      where: {
        id: submission.id,
        status: SubmissionStatus.PENDING,
        submittedAt: null,
      },
      data: {
        proof: resolvedProof,
        proofImages: { set: resolvedProofImages },
        answers: answers || null,
        score,
        status: newStatus,
        // Mark the actual submit moment (distinguishes "in progress" from
        // "submitted / pending review" for a still-PENDING submission).
        submittedAt: new Date(),
        ...(hasMetadata
          ? { metadata: JSON.parse(JSON.stringify(submissionMetadata)) }
          : {}),
        ...(shouldAutoApprove && {
          reviewedAt: new Date(),
          pointsEarned: isBoardTask ? 0 : task.pointsReward,
          xpEarned: isBoardTask ? 0 : task.xpReward,
        }),
      },
    });
    if (claim.count === 0) {
      // Lost the race (another request already submitted this).
      return NextResponse.json(
        { error: "You've already submitted this — it's awaiting review." },
        { status: 409 }
      );
    }
    const updatedSubmission = (await prisma.taskSubmission.findUnique({
      where: { id: submission.id },
    }))!;

    // Reputation: a clean auto-approval nudges the user's trust up.
    if (shouldAutoApprove) {
      await bumpTrust(session.user.id, TRUST_APPROVE);
    }

    // If auto-approved AND not a board task, award points and update user
    if (shouldAutoApprove && !isBoardTask) {
      // Apply per-plan task reward multiplier
      const userPlan = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { package: { select: { taskRewardMultiplier: true } } },
      });
      const multiplier =
        (userPlan as unknown as { package: { taskRewardMultiplier: number } | null })?.package
          ?.taskRewardMultiplier ?? 1;
      const effectivePoints = Math.round(task.pointsReward * multiplier);
      const effectiveXp = Math.round(task.xpReward * multiplier);
      const pointsPerUsd = await getPointsPerUsd();

      // Funded (user-created) task: draw from the pool FIRST (CAS). If the pool
      // can't cover this reward, never mint unfunded points — close the task and
      // return without crediting. (Funded tasks are normally manual-review; this
      // guards the auto path against concurrent overspend.)
      if (task.fundedByUserId) {
        const drawn = await prisma.task.updateMany({
          where: { id: task.id, remainingBudget: { gte: effectivePoints } },
          data: { remainingBudget: { decrement: effectivePoints } },
        });
        if (drawn.count === 0) {
          await prisma.task.update({
            where: { id: task.id },
            data: { remainingBudget: 0, status: "COMPLETED" },
          });
          return NextResponse.json({
            submission: updatedSubmission,
            status: "approved",
            message: "This task's reward budget is exhausted — no reward granted.",
            rewards: { points: 0, xp: 0 },
          });
        }
        if (task.remainingBudget - effectivePoints < task.pointsReward) {
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "COMPLETED" },
          });
        }
      }

      // Update user points and XP
      const user = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          pointsBalance: { increment: effectivePoints },
          xp: { increment: effectiveXp },
          totalEarnings: { increment: effectivePoints / pointsPerUsd },
        },
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          userId: session.user.id,
          type: TransactionType.EARNING,
          status: TransactionStatus.COMPLETED,
          points: effectivePoints,
          amount: effectivePoints / pointsPerUsd,
          description: `Completed task: ${task.title}`,
          reference: `task_${task.id}_${submission.id}`,
          metadata: {
            taskId: task.id,
            taskType: task.type,
            submissionId: submission.id,
            multiplier,
          },
        },
      });

      // Update task completed count
      await prisma.task.update({
        where: { id: task.id },
        data: {
          completedCount: { increment: 1 },
        },
      });

      // Check for level up
      const newLevel = calculateLevel(user.xp + effectiveXp);
      if (newLevel > user.level) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { level: newLevel },
        });

        // Level up notification (in-app + email + push)
        await notifyUser({
          userId: session.user.id,
          type: NotificationType.ACHIEVEMENT,
          title: "Level Up!",
          message: `Congratulations! You've reached level ${newLevel}!`,
          data: { newLevel, previousLevel: user.level },
        });
      }

      // Task completed notification (in-app + email + push)
      await notifyUser({
        userId: session.user.id,
        type: NotificationType.TASK,
        title: "Task Completed!",
        message: `You earned ${effectivePoints} points from "${task.title}"`,
        data: { taskId: task.id, points: effectivePoints, xp: effectiveXp },
        link: "/wallet",
      });

      // Process referral commissions on the effective (multiplied) reward.
      await processReferralCommissions(session.user.id, effectivePoints, task.id);

      return NextResponse.json({
        submission: updatedSubmission,
        status: "approved",
        message: "Task completed successfully!",
        rewards: {
          points: effectivePoints,
          xp: effectiveXp,
        },
        newBalance: user.pointsBalance + effectivePoints,
        score,
      });
    }

    // Board task — reward deferred to board claim
    if (isBoardTask) {
      // Still bump the task's completed counter on auto-approve so analytics
      // and per-task progress remain accurate.
      if (shouldAutoApprove) {
        await prisma.task.update({
          where: { id: task.id },
          data: { completedCount: { increment: 1 } },
        });
      }
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: NotificationType.TASK,
          title: shouldAutoApprove
            ? "Task done — reward bundled"
            : "Submitted — reward bundled",
          message: shouldAutoApprove
            ? `Counted toward your Task Board progress. Claim the board once all tasks are done.`
            : `Submitted and pending review. Reward will be granted when you claim the Task Board.`,
          data: {
            taskId: task.id,
            boardId: task.boardId,
            deferred: true,
          },
        },
      });
      return NextResponse.json({
        submission: updatedSubmission,
        status: shouldAutoApprove ? "approved" : "pending_review",
        deferred: true,
        message: shouldAutoApprove
          ? "Counted toward your Task Board progress. Claim the board once all tasks are done."
          : "Submitted. Reward will be granted when you claim the Task Board.",
      });
    }

    // For manual review tasks
    return NextResponse.json({
      submission: updatedSubmission,
      status: "pending_review",
      message:
        "Your submission has been received and is pending review. You will be notified once it's approved.",
    });
  } catch (error) {
    console.error("Error submitting task:", error);
    return NextResponse.json(
      { error: "Failed to submit task" },
      { status: 500 }
    );
  }
  });
}

// Calculate user level based on XP
function calculateLevel(xp: number): number {
  // Level formula: Each level requires more XP than the previous
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, etc.
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;
  if (xp < 2000) return 5;
  if (xp < 4000) return 6;
  if (xp < 7000) return 7;
  if (xp < 11000) return 8;
  if (xp < 16000) return 9;
  if (xp < 22000) return 10;

  // After level 10, each level requires 10000 more XP
  return Math.floor(10 + (xp - 22000) / 10000);
}

