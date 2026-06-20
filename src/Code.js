/**
 * gdocs-sync — standalone, config-driven Google Doc translation sync.
 *
 * Reproduces "copy doc → Tools → Translate document" for every pair in config.js:
 * rebuild the target body from the source, then translate every text element in
 * place with LanguageApp (the engine the menu button uses).
 *
 * The target doc is edited IN PLACE (opened by id), so its document ID, share
 * link, and permissions never change — only the contents are refreshed.
 *
 * Entry points:
 *   syncAll()           — sync every job (use for triggers / clasp run)
 *   enableNightlySync() — install a daily time-driven trigger for syncAll
 *   disableAutoSync()   — remove those triggers
 */

function syncAll() {
  JOBS.forEach(function (job) {
    try {
      syncJob_(job);
      Logger.log('OK   ' + job.name + ' → https://docs.google.com/document/d/' + job.dst + '/edit');
    } catch (e) {
      Logger.log('FAIL ' + job.name + ': ' + e);
    }
  });
}

/** Rebuild the target doc from the source, then translate it in place. */
function syncJob_(job) {
  const src = DocumentApp.openById(job.src);
  const dst = DocumentApp.openById(job.dst);
  copyBody_(src.getBody(), dst.getBody());
  translateContainer_(dst.getBody(), job.from, job.to_lang);
  dst.saveAndClose();
}

function enableNightlySync() {
  disableAutoSync();
  ScriptApp.newTrigger('syncAll').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Nightly auto-sync enabled (~03:00 ' + Session.getScriptTimeZone() + ').');
}

function disableAutoSync() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncAll'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Auto-sync disabled.');
}

// ── internals ────────────────────────────────────────────────────────────────

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
      // page breaks, HRs, etc. don't translate — skipped.
    } catch (e) {
      Logger.log('skipped element type ' + type + ': ' + e);
    }
  }
  if (toBody.getNumChildren() > 1) {
    const first = toBody.getChild(0);
    if (first.getType() === DocumentApp.ElementType.PARAGRAPH &&
        first.asParagraph().getText() === '') {
      toBody.removeChild(first);
    }
  }
}

/** Recursively translate paragraphs, list items, and table cells in place. */
function translateContainer_(container, from, to) {
  for (let i = 0; i < container.getNumChildren(); i++) {
    const el = container.getChild(i);
    const type = el.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {
      const text = el.editAsText().getText();
      if (text && text.trim().length) {
        el.editAsText().setText(LanguageApp.translate(text, from, to));
      }
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = el.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          translateContainer_(row.getCell(c), from, to);
        }
      }
    }
  }
}
