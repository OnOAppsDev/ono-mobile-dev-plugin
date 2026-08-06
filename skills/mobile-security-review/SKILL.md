---
name: mobile-security-review
description: Methodology for reviewing mobile/web code changes against the shared mobile security standards, across any platform. Used by /review-security via the mobile-security-reviewer agent and the security-review template.
---

## Methodology

1. **Resolve scope and detected platform(s).** Use the file list/diff and the platform(s) `repo-analyst` detected. If this is a whole-repo audit rather than a diff review, state that mode explicitly at the top of the output.

2. **Triage changed files into sensitive-surface buckets.** Map each changed file to zero or more categories from `standards/shared/mobile-security.md`: secrets, storage, on-device data exposure, network, auth/session, browser session & cookies, deep links, WebView, web content security, native bridge, third-party dependencies/manifest, permissions, logging. Files matching no bucket are marked out of scope for security and skipped — this keeps the review free of manufactured noise.

3. **Walk each bucketed file against its standards section's checklist**, recording pass / fail / not-applicable per bullet, and noting the standard ID (e.g. `SEC-STORAGE-1`) for anything that fails. Use platform-appropriate concrete examples for remediation (e.g. Keychain-backed storage for iOS, Keystore/EncryptedSharedPreferences for Android, `react-native-keychain` for RN) rather than always defaulting to the RN example the standards doc happens to use.

4. **Apply the tagged sections to the surfaces they cover.** `standards/shared/mobile-security.md` marks rules `[web only]`, `[native only]`, or `[all platforms]`; untagged rules apply everywhere. For a browser-delivered surface — the React (web) platform, and embedded web content a native or React Native app hosts — check the `[web only]` sections (`SEC-WEB-*`, `SEC-COOKIE-*`) alongside the untagged rules. For an installed binary, check the `[native only]` sections (`SEC-EXPOSURE-*`). Record any section skipped as not applicable, with the reason, rather than omitting it silently.

5. **Run a secrets pass as defense-in-depth.** The `protect-secrets.json` hook only blocks content Claude itself writes/edits during the session — it doesn't scan pre-existing diff content. Re-check the diff for the same secret patterns (hardcoded keys, tokens, private key blocks, `.env` value leakage) independently of whether the hook fired.

6. **Assign severity** using this rubric:
   - **Blocking** — exploitable right now (e.g. a hardcoded production secret, disabled TLS validation).
   - **Major** — exploitable under plausible conditions (e.g. unencrypted token storage, unvalidated deep link driving navigation).
   - **Minor** — a defense-in-depth gap (e.g. missing cert pinning on a non-critical endpoint).
   - **Nit** — hygiene/hardening suggestion (e.g. missing ProGuard rule, verbose non-sensitive logging).

7. **Write concrete remediation per finding** — a specific, platform-appropriate fix pointer, not just a restatement that something is insecure.

8. **Cite the standard ID** for every finding so it traces back to `standards/shared/mobile-security.md`.

9. **Populate `templates/security-review-template.md` in full**, including explicit "None found" for sections with no issues rather than omitting them, so the sign-off has a complete audit trail.

10. **Exclude non-security findings.** Anything about style, correctness, or performance is out of scope for this skill — defer to the active platform's code-review skill instead, per `mobile-security-reviewer`'s boundary rules.
