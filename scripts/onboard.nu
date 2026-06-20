# Guided onboarding for gdocs-sync (Route A — nightly trigger / menu, no GCP setup).
# Walks you through it and stores the two secrets in the keychain via fnox:
#   GDOCS_SYNC_SCRIPT_ID   (the Apps Script Script ID — config)
#   GDOCS_SYNC_CLASP_RC    (contents of ~/.clasprc.json — the clasp OAuth token)
#
# Run via: mise run gdoc:onboard

const EN_DOC = "1-p_yr0CXLOrK8IsabGA9p6PQhh8d9vTqqy4ihSK0IjM"

def clasp-rc-path [] {
  # clasp stores global creds at ~/.clasprc.json (or a local one with --creds).
  let candidates = [
    ([$nu.home-dir ".clasprc.json"] | path join)
    ([$nu.home-dir ".config" "clasp" ".clasprc.json"] | path join)
    (".clasprc.json" | path expand)
  ]
  $candidates | filter {|p| $p | path exists }
}

def main [] {
  print $"(ansi green_bold)gdocs-sync onboarding(ansi reset)"
  print "This sets up the no-Google-Cloud route. Three short steps.\n"

  # ── Step 1: Script ID ──────────────────────────────────────────────────────
  print $"(ansi cyan)Step 1/3 — Get the Apps Script Script ID(ansi reset)"
  print "  a. Open the EN doc:"
  print $"     https://docs.google.com/document/d/($EN_DOC)/edit"
  print "  b. Menu: Extensions -> Apps Script  (creates a script bound to the doc)"
  print "  c. In the script editor: gear icon (Project Settings) -> copy the 'Script ID'\n"
  let script_id = (input "  Paste the Script ID here: " | str trim)
  if ($script_id | is-empty) {
    print $"(ansi red)No Script ID entered. Aborting.(ansi reset)"
    return
  }
  fnox set -p keychain GDOCS_SYNC_SCRIPT_ID $script_id
  print $"  (ansi green)stored GDOCS_SYNC_SCRIPT_ID(ansi reset)\n"

  # ── Step 2: clasp login (interactive) ──────────────────────────────────────
  print $"(ansi cyan)Step 2/3 — Authenticate clasp(ansi reset)"
  print "  A browser window will open. Sign in with the Google account that owns the docs.\n"
  clasp login
  let found = (clasp-rc-path)
  if ($found | is-empty) {
    print $"(ansi red)Could not find a .clasprc.json after login.(ansi reset)"
    print "  If login succeeded, tell me where clasp saved its credentials."
    return
  }
  let rc = ($found | first)
  fnox set -p keychain GDOCS_SYNC_CLASP_RC (open --raw $rc)
  print $"  (ansi green)stored GDOCS_SYNC_CLASP_RC(ansi reset) from ($rc)\n"

  # ── Step 3: link + push ────────────────────────────────────────────────────
  print $"(ansi cyan)Step 3/3 — Link the project and push the code(ansi reset)"
  { scriptId: $script_id, rootDir: "src" } | to json | save -f .clasp.json
  print "  wrote .clasp.json"
  clasp push -f
  print $"  (ansi green)pushed src/ to your Apps Script project(ansi reset)\n"

  # ── Done ───────────────────────────────────────────────────────────────────
  print $"(ansi green_bold)Done — secrets are in the keychain.(ansi reset)"
  print "Last manual bit (one click, no way around the auth approval):"
  print "  1. Reload the EN doc in your browser."
  print "  2. Menu: Sync TH -> Refresh TH from EN (now)  -> approve the authorization prompt."
  print "  3. Optional: Sync TH -> Enable nightly auto-sync."
  print ""
  print "Watch runs at:"
  print $"  https://script.google.com/home/projects/($script_id)/executions"
  print ""
  print "From now on I edit src/Code.js and you run:  mise run gdoc:push"
}
