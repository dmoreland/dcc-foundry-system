/**
 * Thin wrappers around Foundry APIs that changed namespace between v12, v13 and v14.
 * Everything here resolves at call time so the system survives a core update.
 */

export const SYSTEM_ID = "crawler-d20";

export const AppV2 = foundry.applications.api.ApplicationV2;
export const HandlebarsMixin = foundry.applications.api.HandlebarsApplicationMixin;
export const ActorSheetV2 = foundry.applications.sheets.ActorSheetV2;
export const ItemSheetV2 = foundry.applications.sheets.ItemSheetV2;

/** Render a Handlebars template to a string. */
export async function render(path, data) {
  const fn = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  return fn(path, data);
}

/** Warm the template cache so partial-free templates render synchronously. */
export async function preload(paths) {
  const fn = foundry.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  return fn(paths);
}

/** Enrich stored HTML (inline rolls, doc links, etc). */
export async function enrich(html, context = {}) {
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  return TE.enrichHTML(html ?? "", { async: true, ...context });
}

/** Register a document sheet across core versions. */
export function registerSheet(docClass, sheetClass, config) {
  const DSC = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
  DSC.registerSheet(docClass, SYSTEM_ID, sheetClass, config);
}

/** Unregister the core default sheet, tolerating namespace churn. */
export function unregisterCoreSheet(docClass) {
  try {
    const DSC = foundry.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
    const legacy = docClass === Actor
      ? (foundry.appv1?.sheets?.ActorSheet ?? globalThis.ActorSheet)
      : (foundry.appv1?.sheets?.ItemSheet ?? globalThis.ItemSheet);
    if (legacy) DSC.unregisterSheet(docClass, "core", legacy);
  } catch (err) {
    console.warn(`${SYSTEM_ID} | Could not unregister the core sheet; harmless.`, err);
  }
}

/** Bind chat-card buttons regardless of which render hook this core version fires. */
export function onChatCardRender(handler) {
  const wrap = (message, html) => {
    const el = html instanceof HTMLElement ? html : (html?.[0] ?? html);
    if (!el || el.dataset?.crawlerBound) return;
    if (el.dataset) el.dataset.crawlerBound = "1";
    handler(message, el);
  };
  Hooks.on("renderChatMessageHTML", wrap);
  Hooks.on("renderChatMessage", wrap);
}
