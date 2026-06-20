/**
 * gdocs-sync — standalone, config-driven Google Doc translation sync.
 *
 * Reproduces "copy doc → Tools → Translate document" for every pair in config.js,
 * using LanguageApp (the engine the menu button uses).
 *
 * Change-only sync: after the first run it remembers a hash of every source
 * paragraph (in Script Properties). On later runs it re-translates ONLY the
 * paragraphs whose source text changed — untouched target paragraphs (including
 * any manual fixes) are left alone. Falls back to a full rebuild when the doc
 * structure changes (paragraphs added/removed) so the two docs stay aligned.
 *
 * Entry points:
 *   syncAll()           — sync every job (use for triggers / clasp run)
 *   resetSnapshots()    — forget remembered hashes → next run does a full rebuild
 *   enableNightlySync() — install a daily time-driven trigger for syncAll
 *   disableAutoSync()   — remove those triggers
 */

function syncAll() {
  JOBS.forEach(function (job) {
    try {
      const r = syncJob_(job);
      Logger.log('OK   ' + job.name + ' [' + r.mode + ', ' + r.changed + ' changed] → ' +
                 'https://docs.google.com/document/d/' + job.dst + '/edit');
    } catch (e) {
      Logger.log('FAIL ' + job.name + ': ' + e);
    }
  });
}

/** Sync one job. Incremental when structure is stable, full rebuild otherwise. */
function syncJob_(job) {
  const src = DocumentApp.openById(job.src);
  const dst = DocumentApp.openById(job.dst);

  const srcEls = collectTextElements_(src.getBody(), []);
  const srcTexts = srcEls.map(function (e) { return e.editAsText().getText(); });
  const hashes = srcTexts.map(hash_);
  const dstEls = collectTextElements_(dst.getBody(), []);
  const snap = loadSnapshot_(job.name);

  // Full rebuild: first run, no snapshot, or structure drifted out of alignment.
  if (!snap || snap.length !== srcEls.length || dstEls.length !== srcEls.length) {
    copyBody_(src.getBody(), dst.getBody());
    translateContainer_(dst.getBody(), job.from, job.to_lang);
    dst.saveAndClose();
    saveSnapshot_(job.name, hashes);
    return { mode: 'full', changed: srcEls.length };
  }

  // Incremental: translate only paragraphs whose source changed.
  let changed = 0;
  for (let i = 0; i < srcEls.length; i++) {
    if (hashes[i] !== snap[i]) {
      const txt = srcTexts[i];
      dstEls[i].editAsText().setText(
        (txt && txt.trim().length) ? LanguageApp.translate(txt, job.from, job.to_lang) : txt
      );
      changed++;
    }
  }
  dst.saveAndClose();
  saveSnapshot_(job.name, hashes);
  return { mode: 'incremental', changed: changed };
}

/** Forget remembered hashes so the next run rebuilds every target from scratch. */
function resetSnapshots() {
  const props = PropertiesService.getScriptProperties();
  JOBS.forEach(function (job) { props.deleteProperty('snap_' + job.name); });
  Logger.log('Snapshots cleared — next syncAll will full-rebuild.');
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

/** Flatten a body into its text-bearing elements (paragraphs, list items, cells),
 *  in document order. Source and target docs share this order, so element i in
 *  one maps to element i in the other. */
function collectTextElements_(container, out) {
  for (let i = 0; i < container.getNumChildren(); i++) {
    const el = container.getChild(i);
    const type = el.getType();
    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {
      out.push(el);
    } else if (type === DocumentApp.ElementType.TABLE) {
      const table = el.asTable();
      for (let r = 0; r < table.getNumRows(); r++) {
        const row = table.getRow(r);
        for (let c = 0; c < row.getNumCells(); c++) {
          collectTextElements_(row.getCell(c), out);
        }
      }
    }
  }
  return out;
}

/** Compact string hash (djb-ish), base36. */
function hash_(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h.toString(36);
}

function loadSnapshot_(name) {
  const raw = PropertiesService.getScriptProperties().getProperty('snap_' + name);
  return raw ? raw.split(',') : null;
}

function saveSnapshot_(name, hashes) {
  // Note: one Script Property caps at ~9KB. Very large docs (~1000+ paragraphs)
  // would need chunking; add if a doc ever hits that.
  PropertiesService.getScriptProperties().setProperty('snap_' + name, hashes.join(','));
}

/** Replace the destination body with copies of the source body's elements. */
function copyBody_(fromBody, toBody) {
  toBody.clear();
  for (let i = 0; i < fromBody.getNumChildren(); i++) {
    const el = fromBody.getChild(i).copy();
    const type = el.getType();
    try {
      if (type === DocumentApp.ElementType.PARAGRAPH)      toBody.appendParagraph(el.asParagraph());
      else if (type === DocumentApp.ElementType.LIST_ITEM) toBody.appendListItem(el.asListItem());
      else if (type === DocumentApp.ElementType.TABLE)     toBody.appendTable(el.asTable());
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
