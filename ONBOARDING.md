# Onboarding

Two ways to make the sync "just happen". Pick based on whether you want it to run
on a schedule (no setup) or fire from your terminal (needs Google Cloud setup).

---

## Route A — Nightly trigger / menu button  ✅ no extra onboarding

This is the recommended path. Nothing to fetch, no Google Cloud project.

1. Finish the normal setup (`gdoc:login` → `gdoc:auth-save` → `gdoc:id-set` → `gdoc:link` → `gdoc:push`).
2. In the EN doc: **Sync TH → Enable nightly auto-sync** (approve the auth prompt once).
3. Watch runs land on the **Executions** page:
   `https://script.google.com/home/projects/SCRIPT_ID/executions`

That's it. The TH doc refreshes every night (~03:00 Asia/Bangkok). You can still hit
**Refresh TH from EN (now)** any time.

---

## Route B — `mise run gdoc:sync` (run it from the CLI)  ⚠️ needs Google Cloud setup

To execute the function *inside* Apps Script from your terminal, `clasp run` uses the
Apps Script API, which Google only allows through a **standard Google Cloud project +
your own OAuth client**. This is the "extra stuff" you guessed at. One-time:

### What you do (each step is a URL you visit)

1. **Enable the Apps Script API** for your account:
   <https://script.google.com/home/usersettings> → turn it **On**.
2. **Create a Google Cloud project** (or reuse one):
   <https://console.cloud.google.com/projectcreate> → note the **Project number**.
3. **Link it to the script:** Apps Script editor → ⚙ **Project Settings** →
   "Google Cloud Platform (GCP) Project" → **Change project** → paste the project number.
4. **Configure the OAuth consent screen** (External, add yourself as a test user):
   <https://console.cloud.google.com/apis/credentials/consent>
5. **Create an OAuth client** of type **Desktop app** and **download the JSON**:
   <https://console.cloud.google.com/apis/credentials>

### What you hand back

- **Project number** → `mise run gdoc:id-set` is for the Script ID; tell me the GCP
  project number and I'll record it (not secret).
- **The downloaded OAuth client JSON** → store it as a secret (you do this, I never see it):
  ```sh
  fnox set -p keychain GDOCS_SYNC_OAUTH_CREDS "$(cat ~/Downloads/client_secret_*.json)"
  ```

### Then

```sh
# re-login using the Desktop OAuth client so the token can call the Apps Script API
fnox get GDOCS_SYNC_OAUTH_CREDS > /tmp/clasp-creds.json
clasp login --creds /tmp/clasp-creds.json && rm /tmp/clasp-creds.json
mise run gdoc:auth-save     # re-stash the upgraded credential

clasp push -f              # manifest already declares executionApi access
mise run gdoc:sync         # → clasp run syncToThai, executed inside Apps Script
```

---

## Which should you use?

- **Just want it kept in sync without clicking?** → Route A. Done in 2 minutes.
- **Want to trigger it from scripts / a bigger pipeline / CI?** → Route B, worth the setup.

Both run the *same* `syncToThai` code. Route B is not "nuts" — it's just the only way
Google lets you invoke Apps Script remotely, and it carries the GCP project tax.
