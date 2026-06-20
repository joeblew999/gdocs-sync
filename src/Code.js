/**
 * gdocs-sync — keep a Thai (TH) Google Doc in sync with an English (EN) source.
 *
 * Replaces the manual routine: "copy EN doc → Tools → Translate document".
 * There is NO Google API that triggers the built-in "Translate document" button,
 * so we reproduce it: rebuild the TH doc from the EN body, then translate every
 * text element in place with LanguageApp (the same engine the button uses).
 *
 * This script is container-bound to the EN doc, so it adds a "Sync TH" menu.
 */

// ── Config ─────────────────────────────────────────────────────────────────
const EN_DOC_ID  = '1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM'; // English source
const TH_DOC_ID  = '17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A'; // Thai target (kept)
const SOURCE_LANG = 'en';
const TARGET_LANG = 'th';
// ────────────────────────────────────────────────────────────────────────────

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Sync TH')
    .addItem('Refresh TH from EN', 'syncToThai')
    .addToUi();
}

/**
 * Full sync: rebuild the TH doc body from EN, then translate in place.
 * The TH doc keeps its ID/URL — only its contents are refreshed.
 *
 * NOTE: this regenerates the whole body, so any manual edits in the TH doc are
 * overwritten on each run. Change-only sync is the planned next step.
 */
function syncToThai() {
  const enDoc = DocumentApp.openById(EN_DOC_ID);
  const thDoc = DocumentApp.openById(TH_DOC_ID);

  copyBody_(enDoc.getBody(), thDoc.getBody());
  translateContainer_(thDoc.getBody());

  thDoc.saveAndClose();
  Logger.log('Synced. TH: https://docs.google.com/document/d/' + TH_DOC_ID + '/edit');
}

/** Replace the destination body with copies of the source body's elements. */
function copyBody_(fromBody, toBody) {
  toBody.clear(); // leaves a single empty paragraph

  for (let i = 0; i < fromBody.getNumChildren(); i++) {
    const el = fromBody.getChild(i).copy();
    const type = el.getType();
    try {
      if (type === DocumentApp.ElementType.PARAGRAPH)      toBody.appendParagraph(el.asParagraph());
      else if (type === DocumentApp.ElementType.LIST_ITEM) toBody.appendListItem(el.asListItem());
      else if (type === DocumentApp.ElementType.TABLE)     toBody.appendTable(el.asTable());
      // Other element types (page breaks, HRs, etc.) are skipped — they don't translate.
    } catch (e) {
      Logger.log('Skipped element type ' + type + ': ' + e);
    }
  }

  // Remove the leading empty paragraph left by clear(), if the doc has real content after it.
  if (toBody.getNumChildren() > 1) {
    const first = toBody.getChild(0);
    if (first.getType() === DocumentApp.ElementType.PARAGRAPH &&
        first.asParagraph().getText() === '') {
      toBody.removeChild(first);
    }
  }
}

/** Recursively translate paragraphs, list items, and table cells in place. */
function translateContainer_(container) {
  for (let i = 0; i < container.getNumChildren(); i++) {
    const el = container.getChild(i);
    const type = el.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {
      const text = el.editAsText().getText();
      if (text && text.trim().length) {
        const translated = LanguageApp.translate(text, SOURCE_LANG, TARGET_LANG);
        el.editAsText().setText(translated);
      }
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = el.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          translateContainer_(row.getCell(c)); // cells hold paragraphs
        }
      }
    }
  }
}
