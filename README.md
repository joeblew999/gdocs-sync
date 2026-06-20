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

The script is a **standalone** Apps Script project (not bound to any doc), so it's
**reusable**: it syncs every pair listed in `src/config.js`. Add a pair, push, done.

## Layout

```
src/
  appsscript.json   # manifest: V8 runtime + OAuth scopes
  config.js         # JOBS — one entry per doc pair (the reusable config)
  Code.js           # syncAll() + nightly-trigger helpers (no menu — standalone)
mise.toml           # gdoc:* tasks wrapping clasp, + mcp:serve
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

**Easiest — guided:**

```sh
mise run gdoc:onboard
```

It walks you through getting the Script ID + `clasp login`, stores both secrets in the
keychain via fnox, writes `.clasp.json`, and pushes the code. Then reload the EN doc and
**Sync TH → Refresh TH from EN (now)** (approve the auth prompt once).

<details><summary>Manual equivalent (if you'd rather run the steps yourself)</summary>

1. **Bind the script to the EN doc:** open the EN doc → **Extensions → Apps Script** →
   **Project Settings** → copy the **Script ID**.
2. **Authenticate clasp** and stash the credential:
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
</details>

## Daily use

- Add/edit a pair in `src/config.js`, then `mise run gdoc:push`.
- `mise run gdoc:urls` prints the live console/executions/triggers/doc URLs.
- It's standalone (no in-doc menu). Run `syncAll` one of these ways:
  - **Editor:** open the script (`gdoc:open`), pick `syncAll`, **Run** (approve scopes once).
  - **Nightly:** run `enableNightlySync` once → it auto-runs every night.
  - **Terminal:** `mise run gdoc:sync` (needs the Route B setup in ONBOARDING.md).

## clasp MCP server

clasp ships an MCP server (`clasp start-mcp-server`), wired in two ways:

- `mise run mcp:serve` — run it ad-hoc.
- Registered in `~/.claude.json` as the **`clasp`** server (launched via mise, cwd = this
  repo), so **any Claude session** can drive Apps Script directly. Tools:
  `list_projects`, `create_project`, `clone_project`, `push_files`, `pull_files`.

## Make it run on its own

See **[ONBOARDING.md](ONBOARDING.md)**.

- **Nightly (no setup):** run `enableNightlySync` once. Watch it on the Executions page.
- **Terminal (`mise run gdoc:sync`):** needs a Google Cloud project + OAuth client
  (`clasp run`). Steps and URLs are in ONBOARDING.md.

## Current behaviour & limits (v1)

- **Full regeneration:** every run rebuilds the whole TH body and re-translates it.
  Any manual edits in the TH doc are overwritten. (Change-only sync is the planned next step.)
- **Paragraph-level translation:** inline styling on a single word (e.g. one bold word
  mid-sentence) is not preserved; paragraph/heading styles are. This gives better
  translation quality than translating word-by-word.
- Images, headers/footers, and equations are left untouched.

## Roadmap

- [x] Standalone + config-driven (multiple pairs via `src/config.js`).
- [x] Nightly time-driven trigger (`enableNightlySync`).
- [x] clasp MCP server wired for any Claude session.
- [ ] Change-only sync — hash source paragraphs, re-translate only what changed.
- [ ] Glossary / do-not-translate term list.
