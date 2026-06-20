# gdocs-sync

> **Links** &nbsp;·&nbsp; replace `SCRIPT_ID` with your Apps Script Script ID, or run `mise run gdoc:urls`
>
> | | URL |
> | --- | --- |
> | 📄 EN doc (source) | https://docs.google.com/document/d/1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM/edit |
> | 📄 TH doc (target) | https://docs.google.com/document/d/17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A/edit |
> | 🧩 Apps Script editor | `https://script.google.com/home/projects/SCRIPT_ID/edit` |
> | ▶️ **Executions** (watch it sync) | `https://script.google.com/home/projects/SCRIPT_ID/executions` |
> | ⏰ Triggers (nightly auto-sync) | `https://script.google.com/home/projects/SCRIPT_ID/triggers` |

Keep a **Thai (TH)** Google Doc in sync with an **English (EN)** source, automatically.

This replaces the manual routine: *copy the EN doc → Tools → Translate document*.
There is **no Google API that triggers the built-in "Translate document" button**, so this
project reproduces it with [Apps Script](https://developers.google.com/apps-script):
it rebuilds the TH doc from the EN body and translates every text element in place using
`LanguageApp` — the same translation engine the menu button uses.

The Apps Script project is managed as files on disk via
[`clasp`](https://github.com/google/clasp), so the code lives in git and deploys from the CLI.

## Docs

| Role | ID |
| ---- | -- |
| EN source | `1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM` |
| TH target | `17k8fZUvbESDOwASl_3o5q9s6dvR7yFnGXqWzdc0Tc1A` |

(Both are set in `src/Code.js`.)

## Layout

```
src/
  appsscript.json   # manifest: V8 runtime + OAuth scopes
  Code.js           # the sync logic + "Sync TH" menu
mise.toml           # gdoc:* tasks wrapping clasp
fnox.toml           # secret contract: clasp OAuth credential + Script ID (keychain)
```

## Secrets (fnox)

Two values live in the macOS keychain via [fnox](https://github.com/jdx/fnox), never in committed files:

| Item | What | Secret? |
| ---- | ---- | ------- |
| `GDOCS_SYNC_CLASP_RC` | contents of `~/.clasprc.json` (clasp OAuth refresh token) | yes |
| `GDOCS_SYNC_SCRIPT_ID` | the Apps Script Script ID (used to regenerate `.clasp.json`) | no, config |

`.clasp.json` itself is gitignored and regenerated from the keychain by `gdoc:link`.

## One-time setup

1. **Bind the script to the EN doc** so it can add a menu:
   - Open the EN doc → **Extensions → Apps Script** → **Project Settings** → copy the **Script ID**.
2. **Authenticate clasp** (interactive, your Google account) and stash the credential:
   ```sh
   mise run gdoc:login        # browser OAuth → ~/.clasprc.json
   mise run gdoc:auth-save    # capture it into the keychain
   ```
3. **Store the Script ID and link the project:**
   ```sh
   mise run gdoc:id-set <SCRIPT_ID>
   mise run gdoc:link         # writes .clasp.json from the keychain
   ```
4. **Push the code up:**
   ```sh
   mise run gdoc:push         # auth-restores from keychain, then clasp push
   ```

## Daily use

- Edit `src/Code.js`, then `mise run gdoc:push`.
- In the EN doc, reload → **Sync TH → Refresh TH from EN (now)**.
- First run prompts for **authorization** (your own account on your own docs) — approve it.
- `mise run gdoc:urls` prints the live console/executions/triggers/doc URLs.

## Make it run on its own

See **[ONBOARDING.md](ONBOARDING.md)**. Two routes:

- **Route A — nightly trigger / menu** (recommended, no extra setup): **Sync TH → Enable
  nightly auto-sync**. Watch it on the Executions page.
- **Route B — `mise run gdoc:sync`** (trigger from the terminal): needs a Google Cloud
  project + OAuth client (`clasp run`). Steps and the URLs to visit are in ONBOARDING.md.

## Current behaviour & limits (v1)

- **Full regeneration:** every run rebuilds the whole TH body and re-translates it.
  Any manual edits in the TH doc are overwritten. (Change-only sync is the planned next step.)
- **Paragraph-level translation:** inline styling on a single word (e.g. one bold word
  mid-sentence) is not preserved; paragraph/heading styles are. This gives better
  translation quality than translating word-by-word.
- Images, headers/footers, and equations are left untouched.

## Roadmap

- [ ] Change-only sync — hash EN paragraphs in `PropertiesService`, re-translate only what changed.
- [ ] Optional time-driven trigger (nightly auto-sync).
- [ ] Glossary / do-not-translate term list.
