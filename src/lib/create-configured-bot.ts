import { t } from "@/lib/i18n";
import { api, desktopApprovalBridge, persistBotUpdate, persistTaskApproval, type Bot } from "@/state/store";
import type { Routine } from "./routines";
import type { BotCreationDraft } from "./bot-creation-draft";
import { imageAttachmentFromFile } from "./composer-attachments";
import type { BotVisibility } from "../../shared/wire";
import { botAvatarUrlFromStoredPath } from "../../shared/bot-avatar";

export async function preparedBotTemplate(draft: BotCreationDraft) {
  const template = draft.export();
  if (template.profile.avatarUrl?.startsWith("blob:")) {
    if (!draft.avatarFile) throw new Error(t("newBot.feedback.avatarAgain"));
    const uploaded = await imageAttachmentFromFile(draft.avatarFile);
    const avatarUrl = uploaded && botAvatarUrlFromStoredPath(uploaded.path);
    if (!avatarUrl) throw new Error(t("newBot.feedback.avatarStore"));
    template.profile.avatarUrl = avatarUrl;
  }
  return template;
}

/** File setup and native consent finish before Chief handover or routine activation can affect other work. */
export async function createConfiguredBot(
  draft: BotCreationDraft,
  request: typeof api = api,
  update: typeof persistBotUpdate = persistBotUpdate,
  approvals = desktopApprovalBridge(),
  visibility?: BotVisibility,
): Promise<{ bot: Bot; warnings: string[] }> {
  const template = await preparedBotTemplate(draft);
  const { chiefOfStaff, managedSections, toolScope, ...profile } = template.profile;
  if (!profile.name?.trim()) throw new Error(t("newBot.feedback.nameRequired"));
  const preset = draft.preset;
  const response = await request<{ bot: Bot }>("/api/bots", {
    method: "POST", body: JSON.stringify({ name: profile.name, title: profile.title,
      description: profile.description, modelSelection: profile.modelSelection, section: profile.section,
      requireAvailableModel: true, useDefaults: false, ...(visibility !== undefined ? { visibility } : {}),
      ...(Object.hasOwn(template.profile, "toolScope") ? { settings: { toolScope } } : {}),
      ...(preset ? { preset: preset.id } : {}) }),
  });
  let bot = response.bot;
  const routines: Array<{ id: string; enabled: boolean }> = [];
  const warnings: string[] = [];
  try {
    // The create endpoint already validated the model and effort defaults; never overwrite them with the raw draft.
    const patched = await update(bot.id, { ...profile, modelSelection: bot.modelSelection, ...draft.consent }, new AbortController().signal,
      request, approvals, bot);
    bot = { ...bot, ...patched };
    if (profile.approvalMode === "full" || profile.approvalMode === "custom") {
      if (patched.approvalMode !== profile.approvalMode) {
        throw new Error(t("newBot.feedback.botApproval"));
      }
      const granted = await persistTaskApproval(bot.id, bot.threadId, {
        approvalMode: profile.approvalMode,
        acknowledgeLocalAuto: draft.consent.acknowledgeLocalAuto === true,
      }, approvals, request);
      if (granted.approvalMode !== profile.approvalMode) {
        throw new Error(t("newBot.feedback.threadApproval"));
      }
    }
    for (const [path, text] of Object.entries(template.memory)) {
      if (preset?.notes.includes(path)) continue;
      await request(`/api/bots/${bot.id}/memory/file`, {
        method: "PUT", body: JSON.stringify({ path, text }),
      });
    }
    for (const skill of template.skills) {
      if (preset?.skills.includes(skill.name)) continue;
      await request(`/api/bots/${bot.id}/skill-template`, { method: "POST", body: JSON.stringify(skill) });
    }
    for (const routine of template.routines) {
      const result = await request<{ routine: Routine }>("/api/routines", {
        method: "POST", body: JSON.stringify({ ...routine, botId: bot.id, enabled: false }),
      });
      routines.push({ id: result.routine.id, enabled: routine.enabled !== false });
    }
  } catch (error) {
    const cleanup: string[] = [];
    for (const routine of routines) {
      try { await request(`/api/routines/${routine.id}`, { method: "DELETE" }); }
      catch { cleanup.push(t("newBot.feedback.cleanupRoutine", { id: routine.id })); }
    }
    try { await request(`/api/bots/${bot.id}`, { method: "DELETE" }); }
    catch { cleanup.push(t("newBot.feedback.cleanupBot", { name: bot.name, id: bot.id })); }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(cleanup.length ? t("newBot.feedback.cleanupFailed", { message, items: cleanup.join(", ") }) : message);
  }
  // Creation is complete: never delete a bot whose routine may have run, undo a Chief handover, or invite a duplicate retry.
  if (chiefOfStaff) {
    try {
      const result = await request<{ bot: Bot }>(`/api/bots/${bot.id}`, {
        method: "PATCH", body: JSON.stringify({ chiefOfStaff, managedSections, acknowledgePeerScope: true }),
      });
      bot = { ...bot, ...result.bot };
    } catch (error) {
      warnings.push(t("newBot.feedback.chiefWarning", { error: error instanceof Error ? error.message : String(error) }));
    }
  }
  for (const routine of routines.filter(routine => routine.enabled)) {
    try { await request(`/api/routines/${routine.id}`, { method: "PATCH", body: JSON.stringify({ enabled: true }) }); }
    catch (error) { warnings.push(t("newBot.feedback.routineWarning", { error: error instanceof Error ? error.message : String(error) })); }
  }
  return { bot, warnings };
}
