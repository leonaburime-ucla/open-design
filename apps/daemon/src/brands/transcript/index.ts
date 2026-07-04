/** @module transcript/index
 * Synthetic transcript lifecycle for programmatic brand extraction.
 * Extraction and finalization call this layer to seed, reconcile, and backfill user-visible assistant rows without depending on each other.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { ProjectMetadata } from '@open-design/contracts';

import { listFiles, resolveProjectDir } from '../../project/index.js';
import { listMessages, upsertMessage, type insertProject } from '../../db.js';
import { BRAND_KIT_FILE, normalizeBrandKitLocale } from '../kit/index.js';
import { readBrandDetail } from '../catalog/index.js';
import {
  BRAND_BROWSER_TAB_ID,
  brandProjectId,
  hostnameOf,
  readMeta,
} from '../core/index.js';
import type { TranscriptAgent } from '../core/index.js';

export async function backfillBrandExtractionTranscriptForProject(input: {
  db: Parameters<typeof insertProject>[0];
  conversationId: string;
  randomId: () => string;
  brandsRoot: string;
  projectsRoot: string;
  project: {
    id: string;
    createdAt?: number | null;
    metadata?: ProjectMetadata | null;
  };
  transcriptAgent?: TranscriptAgent;
}): Promise<void> {
  if (listMessages(input.db, input.conversationId).length > 0) return;
  const metadata = input.project.metadata;
  if (!metadata || metadata.kind !== 'brand' || metadata.importedFrom !== 'brand-extraction') return;
  const brandId = metadata.brandId;
  if (!brandId) return;
  const latest = readBrandDetail(input.brandsRoot, brandId);
  const sourceUrl = latest?.meta.sourceUrl || metadata.brandSourceUrl || '';
  if (!sourceUrl) return;
  const startedAt = typeof input.project.createdAt === 'number' && Number.isFinite(input.project.createdAt)
    ? input.project.createdAt
    : Date.now();
  const locale = normalizeBrandKitLocale(latest?.meta.locale);
  const sourceLabel = metadata.sourceFileName?.trim() || hostnameOf(sourceUrl);
  const transcriptInput = {
    db: input.db,
    conversationId: input.conversationId,
    randomId: input.randomId,
    sourceUrl,
    sourceLabel,
    locale,
    startedAt,
    ...(input.transcriptAgent ? { transcriptAgent: input.transcriptAgent } : {}),
  };
  if (latest?.meta.status === 'ready' && latest.meta.designSystemId) {
    await seedProgrammaticExtractionTranscript({
      ...transcriptInput,
      brandName: latest.brand?.name ?? sourceLabel,
      designSystemId: latest.meta.designSystemId,
      projectsRoot: input.projectsRoot,
      projectId: input.project.id,
      metadata: {
        ...metadata,
        entryFile: BRAND_KIT_FILE,
        brandDesignSystemId: latest.meta.designSystemId,
      },
    });
    return;
  }
  seedProgrammaticExtractionStartTranscript(transcriptInput);
}

interface ProgrammaticExtractionTranscript {
  userMessageId: string;
  assistantMessageId: string;
}

/** The terminal outcomes the synthetic programmatic-extraction row settles into.
 *  `succeeded` overwrites any earlier card (a slow site that eventually lands);
 *  the others never clobber a recorded success. */
export type ProgrammaticExtractionOutcome = 'succeeded' | 'needs_attention' | 'stopped';

/**
 * Flip the seeded programmatic-extraction transcript row to a terminal run
 * status. This is the SINGLE authority that retires the synthetic
 * "AMR · Working 13m…" row, driven entirely by persisted brand meta + the
 * message itself, so it works from EVERY completion point — finalize success,
 * give-up / blocked / stall, and user stop — and survives a daemon restart.
 * Best-effort and idempotent; safe to call repeatedly.
 *
 * The bug this fixes: the row used to be reconciled only by a single racy timer
 * gated on re-reading `status === 'ready'`. A heavy site that finalized AFTER
 * the timer fired left the row "running" forever ("succeeded but never
 * terminated"); a blocked/failed origin left it "running" forever too ("stuck
 * running"). Anchoring the reconcile to the real terminal points removes the
 * race entirely.
 */
export async function reconcileProgrammaticExtractionTranscript(input: {
  db: Parameters<typeof insertProject>[0];
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  outcome: ProgrammaticExtractionOutcome;
  locale?: string;
}): Promise<void> {
  const meta = readMeta(input.brandsRoot, input.brandId);
  const conversationId = meta?.conversationId;
  const assistantMessageId = meta?.extractionTranscriptMessageId;
  if (!meta || !conversationId || !assistantMessageId) return;

  const current = listMessages(input.db, conversationId).find((m) => m.id === assistantMessageId);
  if (!current) return;
  // Never downgrade a recorded success. A deliberate user Stop may still
  // supersede an earlier stall/needs-attention row for the same extraction.
  if (current.runStatus === 'succeeded') return;
  if (input.outcome === 'needs_attention' && current.runStatus && current.runStatus !== 'running') return;

  const locale = input.locale ?? meta.locale ?? undefined;
  const copy = brandExtractionTranscriptCopy(locale);
  const sourceLine = meta.sourceUrl.startsWith('designmd://') ? copy.sourceDesignMd : meta.sourceUrl;
  const startedAt = current.startedAt ?? meta.extractionStartedAt ?? current.createdAt ?? Date.now();
  const createdAt = current.createdAt ?? startedAt;
  const now = Date.now();
  const agentFields = {
    ...(current.agentId ? { agentId: current.agentId } : {}),
    ...(current.agentName ? { agentName: current.agentName } : {}),
  };

  if (input.outcome === 'succeeded') {
    const detail = readBrandDetail(input.brandsRoot, input.brandId);
    const designSystemId = meta.designSystemId ?? detail?.meta.designSystemId;
    // Defensive: only claim success once the system is actually registered.
    if (!designSystemId) return;
    const brandName = detail?.brand?.name?.trim() || hostnameOf(meta.sourceUrl);
    const title = copy.doneTitle(brandName);
    const body = copy.doneBody(designSystemId, sourceLine);
    const next = copy.next;
    const projectId = meta.projectId ?? brandProjectId(input.brandId);
    const producedFiles = await brandExtractionProducedFiles(input.projectsRoot, projectId, {
      kind: 'brand',
      importedFrom: 'brand-extraction',
      brandId: input.brandId,
      brandSourceUrl: meta.sourceUrl,
      entryFile: BRAND_KIT_FILE,
      brandDesignSystemId: designSystemId,
    });
    upsertMessage(input.db, conversationId, {
      id: assistantMessageId,
      role: 'assistant',
      content: [title, '', body, '', next].join('\n'),
      ...agentFields,
      events: [
        { kind: 'text', text: `${title}\n\n` },
        { kind: 'text', text: `${body}\n\n${next}` },
      ],
      producedFiles,
      runStatus: 'succeeded',
      createdAt,
      startedAt,
      endedAt: now,
    });
    return;
  }

  // needs_attention | stopped — an actionable terminal so the row stops counting
  // up. Browser-assist recovery belongs in this same transcript row so it cannot
  // race with the web-side status poll that also offers the recovery path.
  const stopped = input.outcome === 'stopped';
  const title = stopped ? copy.stoppedTitle : copy.stalledTitle;
  const body = stopped
    ? copy.stoppedBody(sourceLine)
    : copy.stalledBody(sourceLine, meta.blockedReason ?? null);
  const browserAssistCard =
    !stopped && /^https?:\/\//i.test(meta.sourceUrl)
      ? brandBrowserAssistOdCard({
          brandId: input.brandId,
          sourceUrl: meta.sourceUrl,
          ...(meta.blockedReason ? { reason: meta.blockedReason } : {}),
        })
      : null;
  const content = browserAssistCard
    ? [title, '', body, '', browserAssistCard].join('\n')
    : [title, '', body].join('\n');
  upsertMessage(input.db, conversationId, {
    id: assistantMessageId,
    role: 'assistant',
    content,
    ...agentFields,
    events: [{ kind: 'text', text: content }],
    runStatus: stopped ? 'canceled' : 'failed',
    createdAt,
    startedAt,
    endedAt: now,
  });
}

function brandBrowserAssistOdCard(input: {
  brandId: string;
  sourceUrl: string;
  reason?: string | null;
}): string {
  const payload = JSON.stringify({
    brandId: input.brandId,
    browserTabId: BRAND_BROWSER_TAB_ID,
    ...(input.sourceUrl ? { url: input.sourceUrl } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  });
  return `<od-card type="brand-browser-assist">${payload}</od-card>`;
}

async function seedProgrammaticExtractionTranscript(input: {
  db: Parameters<typeof insertProject>[0];
  conversationId: string;
  randomId: () => string;
  sourceUrl: string;
  sourceLabel: string;
  brandName: string;
  designSystemId: string;
  projectsRoot: string;
  projectId: string;
  locale: string;
  startedAt: number;
  transcript?: ProgrammaticExtractionTranscript | null | undefined;
  transcriptAgent?: TranscriptAgent;
  metadata: ProjectMetadata;
}): Promise<void> {
  const now = Date.now();
  const brandName = input.brandName.trim() || input.sourceLabel;
  const copy = brandExtractionTranscriptCopy(input.locale);
  const sourceLine = input.sourceUrl.startsWith('designmd://')
    ? copy.sourceDesignMd
    : input.sourceUrl;
  const title = copy.doneTitle(brandName);
  const body = copy.doneBody(input.designSystemId, sourceLine);
  const next = copy.next;
  const assistantContent = [title, '', body, '', next].join('\n');
  const messages = listMessages(input.db, input.conversationId);
  const alreadySeeded = messages.some((message) =>
    message.role === 'assistant' && message.content === assistantContent
  );
  if (alreadySeeded) return;
  const transcript = input.transcript ?? {
    userMessageId: input.randomId(),
    assistantMessageId: input.randomId(),
  };
  upsertMessage(input.db, input.conversationId, {
    id: transcript.userMessageId,
    role: 'user',
    content: copy.user(sourceLine),
    createdAt: input.startedAt,
  });
  upsertMessage(input.db, input.conversationId, {
    id: transcript.assistantMessageId,
    role: 'assistant',
    content: assistantContent,
    ...(input.transcriptAgent?.agentId ? { agentId: input.transcriptAgent.agentId } : {}),
    ...(input.transcriptAgent?.agentName ? { agentName: input.transcriptAgent.agentName } : {}),
    events: [
      { kind: 'text', text: `${title}\n\n` },
      {
        kind: 'text',
        text: `${body}\n\n${next}`,
      },
    ],
    producedFiles: await brandExtractionProducedFiles(input.projectsRoot, input.projectId, input.metadata),
    runStatus: 'succeeded',
    createdAt: now,
    startedAt: input.startedAt,
    endedAt: now,
  });
}

export function seedProgrammaticExtractionStartTranscript(input: {
  db: Parameters<typeof insertProject>[0];
  conversationId: string;
  randomId: () => string;
  sourceUrl: string;
  sourceLabel: string;
  locale: string;
  startedAt: number;
  transcriptAgent?: TranscriptAgent;
}): ProgrammaticExtractionTranscript {
  const copy = brandExtractionTranscriptCopy(input.locale);
  const sourceLine = input.sourceUrl.startsWith('designmd://')
    ? copy.sourceDesignMd
    : input.sourceUrl;
  const userMessageId = input.randomId();
  const assistantMessageId = input.randomId();
  const startedText = copy.started(sourceLine);
  upsertMessage(input.db, input.conversationId, {
    id: userMessageId,
    role: 'user',
    content: copy.user(sourceLine),
    createdAt: input.startedAt,
  });
  upsertMessage(input.db, input.conversationId, {
    id: assistantMessageId,
    role: 'assistant',
    content: startedText,
    ...(input.transcriptAgent?.agentId ? { agentId: input.transcriptAgent.agentId } : {}),
    ...(input.transcriptAgent?.agentName ? { agentName: input.transcriptAgent.agentName } : {}),
    events: [{ kind: 'text', text: startedText }],
    runStatus: 'running',
    createdAt: input.startedAt,
    startedAt: input.startedAt,
  });
  return { userMessageId, assistantMessageId };
}

interface BrandExtractionTranscriptCopy {
  sourceDesignMd: string;
  next: string;
  user: (source: string) => string;
  started: (source: string) => string;
  doneTitle: (name: string) => string;
  doneBody: (designSystemId: string, source: string) => string;
  /** Actionable terminal shown when the programmatic pass stalls (30s) or hits
   *  a wall the deterministic harvest can't pass. */
  stalledTitle: string;
  stalledBody: (source: string, reason: string | null) => string;
  /** Terminal shown when the user stops the programmatic pass. */
  stoppedTitle: string;
  stoppedBody: (source: string) => string;
}

function brandExtractionTranscriptCopy(locale?: string | null): BrandExtractionTranscriptCopy {
  switch (normalizeBrandKitLocale(locale)) {
    case 'zh-CN':
      return {
        sourceDesignMd: '粘贴的 DESIGN.md',
        user: (source) => `从 ${source} 抽取一个设计系统。`,
        started: (source) => `正在从 ${source} 进行程序化设计系统抽取。`,
        doneTitle: (name) => `${name} 的程序化抽取已完成。`,
        doneBody: (designSystemId, source) =>
          `我已经从 ${source} 创建并注册了 ${designSystemId} 设计系统。现在可以预览，也可以直接用于新设计。`,
        next: '接下来，你可以运行 AI 优化做更深一轮抽取，或者用这个系统新建设计。',
        stalledTitle: '程序化抽取需要你帮一把。',
        stalledBody: (source, reason) =>
          `我没能自动从 ${source} 抽取完成${reason ? `（${reason}）` : ''}。请使用下方浏览器辅助卡片打开 Browser，必要时清掉人机验证，然后点击 More > 下载页面，等待页面快照保存成功，再回到左侧“下一步”卡片点击“继续提取”继续程序化抽取。如果下方卡片没有出现，也可以手动打开右侧 Browser tab，按同样的 More > 下载页面 > 继续提取路径操作；也可以直接用 AI 继续。`,
        stoppedTitle: '抽取已停止。',
        stoppedBody: (source) =>
          `你停止了从 ${source} 的抽取。已经抽到的内容会保留成一个可编辑的设计系统，你可以从这里继续编辑或重试。`,
      };
    case 'zh-TW':
      return {
        sourceDesignMd: '貼上的 DESIGN.md',
        user: (source) => `從 ${source} 抽取一個設計系統。`,
        started: (source) => `正在從 ${source} 進行程式化設計系統抽取。`,
        doneTitle: (name) => `${name} 的程式化抽取已完成。`,
        doneBody: (designSystemId, source) =>
          `我已經從 ${source} 建立並註冊了 ${designSystemId} 設計系統。現在可以預覽，也可以直接用於新設計。`,
        next: '接下來，你可以執行 AI 優化做更深一輪抽取，或者用這個系統建立新設計。',
        stalledTitle: '程式化抽取需要你幫一把。',
        stalledBody: (source, reason) =>
          `我沒能自動從 ${source} 抽取完成${reason ? `（${reason}）` : ''}。請使用下方瀏覽器輔助卡片開啟 Browser，必要時清掉人機驗證，然後點擊 More > 下載頁面，等待頁面快照儲存成功，再回到左側「下一步」卡片點擊「繼續擷取」繼續程式化擷取。如果下方卡片沒有出現，也可以手動開啟右側 Browser tab，按同樣的 More > 下載頁面 > 繼續擷取路徑操作；也可以直接用 AI 繼續。`,
        stoppedTitle: '抽取已停止。',
        stoppedBody: (source) =>
          `你停止了從 ${source} 的抽取。已經抽到的內容會保留成一個可編輯的設計系統，你可以從這裡繼續編輯或重試。`,
      };
    default:
      return {
        sourceDesignMd: 'pasted DESIGN.md',
        user: (source) => `Extract a design system from ${source}.`,
        started: (source) => `Programmatic design-system extraction started from ${source}.`,
        doneTitle: (name) => `Programmatic extraction finished for ${name}.`,
        doneBody: (designSystemId, source) =>
          `I created and registered the ${designSystemId} design system from ${source}. It is ready to preview and can be used in new designs now.`,
        next: 'Next, you can run AI Optimize for a deeper extraction pass, or create a new design with this system.',
        stalledTitle: 'The automatic pass needs a hand.',
        stalledBody: (source, reason) =>
          `I couldn't finish extracting ${source} automatically${reason ? ` (${reason})` : ''}. Use the browser assist card below to open Browser, clear any human check, click More > Download Page, wait for the saved snapshot success message, then use the left Next Step card and click Continue extraction to continue the programmatic extraction. If the card is not visible, manually open the Browser tab on the right and follow the same More > Download Page > Continue extraction path — or keep going with AI.`,
        stoppedTitle: 'Extraction stopped.',
        stoppedBody: (source) =>
          `You stopped extracting ${source}. Whatever was gathered is kept as an editable design system — pick up from there or retry.`,
      };
  }
}

async function brandExtractionProducedFiles(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
): Promise<unknown[]> {
  const files = await listFiles(projectsRoot, projectId, { metadata }).catch(() => []);
  const visible = files.filter((file) => {
    if (!file || file.type === 'dir') return false;
    const name = String(file.name ?? file.path ?? '');
    if (!name || name.startsWith('.') || name.includes('/.')) return false;
    return !name.toLowerCase().endsWith('.sketch.json');
  });
  if (visible.length > 0) return visible;
  const filePath = path.join(resolveProjectDir(projectsRoot, projectId, metadata), BRAND_KIT_FILE);
  let size = 0;
  let mtime = Date.now();
  try {
    const stat = fs.statSync(filePath);
    size = stat.size;
    mtime = stat.mtimeMs;
  } catch {
    // The file is created just above; if a test stubs that path, keep the
    // transcript usable and let the live project file listing provide details.
  }
  return [{
    name: BRAND_KIT_FILE,
    path: BRAND_KIT_FILE,
    size,
    mtime,
    kind: 'html',
    mime: 'text/html',
  }];
}
