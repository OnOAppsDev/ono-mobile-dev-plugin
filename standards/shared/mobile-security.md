# Mobile Security Standards

## Purpose & Scope

These standards apply to app code reviewed by the shared `mobile-security-reviewer` agent via `/review-security`. Each rule states a **platform-neutral requirement** (the normative rule); where a platform's concrete API, library, or tooling adds real value, it appears as a labelled example (React Native / iOS / Android / React). Categories loosely follow the OWASP Mobile Application Security Verification Standard (MASVS) and, for browser-delivered surfaces, the OWASP Application Security Verification Standard (ASVS); see [References](#references). Each bullet carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

**Applicability.** Rules added for the web and native extensions carry an explicit tag — `[web only]`, `[native only]`, or `[all platforms]`. **A rule with no tag applies to all supported platforms unless its own text says otherwise.** `[web only]` means a browser-delivered surface: the React (web) platform, and any embedded web content a native or React Native app hosts. `[native only]` means an installed application binary: React Native, iOS, and Android.

**Review checks.** Rules in the tagged sections carry a `Review check:` line describing what a reviewer actually inspects or searches for. It is an aid to applying the rule, not an additional requirement, and never a mandate to adopt a particular framework or API.

## Secrets & Credentials Management

- `SEC-SECRETS-1` No hardcoded API keys, tokens, passwords, or signing credentials in source files.
- `SEC-SECRETS-2` Anything baked into the shipped build artifact at build time must be treated as public — build artifacts are reverse-engineerable, so a build-time constant is not a secret.
  - React Native: constants injected via `react-native-config` or embedded in the JS bundle.
  - iOS: values in `Info.plist`, build settings, or `.xcconfig`.
  - Android: `BuildConfig` fields / Gradle `resValue` constants.
  - React: anything reaching the client bundle (bundler `define`, `import.meta.env`).
- `SEC-SECRETS-3` `.env` files (and any file holding real credentials) are `.gitignore`d; only `.env.example` with placeholder values is committed.
- `SEC-SECRETS-4` Any secret that reaches source control or a public branch is rotated immediately, not just removed from the diff.

## Secure Local Storage

- `SEC-STORAGE-1` Tokens, credentials, and PII are stored in the platform's OS-backed secure store, never in plaintext key-value storage.
  - React Native: `react-native-keychain` / `expo-secure-store`, never plain `AsyncStorage`.
  - iOS: Keychain Services.
  - Android: Keystore-backed storage, e.g. `EncryptedSharedPreferences`.
  - React: no true client-side secure store — prefer httpOnly + Secure cookies; never keep tokens in `localStorage`/`sessionStorage`.
- `SEC-STORAGE-2` Any fast/embedded key-value store used for sensitive data has encryption enabled explicitly (it is usually not on by default) — e.g. MMKV with an encryption key.
- `SEC-STORAGE-3` Persisted application/UI state does not include tokens or PII unless the persistence layer itself is encrypted.
  - React Native / React: redux-persist, Zustand `persist`, MMKV-backed stores.
  - iOS: persisted `UserDefaults`/`@AppStorage`, Codable caches.
  - Android: DataStore / Room caches.
- `SEC-STORAGE-4` Temp files/caches created from sensitive downloads (documents, images with PII) are cleaned up after use.

## On-Device Data Exposure

Ways sensitive data leaves the app without any network call. Storage-at-rest requirements stay in [Secure Local Storage](#secure-local-storage) — these rules cover the OS surfaces that copy, capture, or transfer that data.

- `SEC-EXPOSURE-1` **[native only]** Sensitive data is excluded from OS backup and device-migration flows, so a restore onto another device does not carry credentials or PII with it. Data already held in the platform's secure store per `SEC-STORAGE-1` generally inherits the correct behavior; anything stored outside it must be excluded deliberately.
  - iOS: files marked with the "do not back up" resource attribute; Keychain items scoped so they do not migrate.
  - Android: the app's backup/data-extraction rules narrowed to exclude sensitive files and preference stores.
  - React Native: whichever of the above applies to the file or store the JS layer writes through.
  - *Review check:* for each new persisted file, database, or preference store, ask whether it would appear in a device backup, and confirm the answer is intentional.
- `SEC-EXPOSURE-2` **[native only]** Screens displaying credentials, payment details, or regulated data are protected from screenshots and from the OS app-switcher snapshot where the app's risk tier warrants it — not blanket-applied to every screen.
  - iOS: obscuring the window when the app resigns active; screen-capture notifications where relevant.
  - Android: the window-level secure flag on the affected screen only.
  - *Review check:* identify screens rendering sensitive values; confirm a deliberate decision exists for each, and that protection is scoped to those screens rather than applied globally.
- `SEC-EXPOSURE-3` **[native only]** Sensitive values are not written to the system clipboard except in response to an explicit user action, and are marked sensitive or cleared afterwards where the platform supports it. This is the outbound counterpart to `SEC-BRIDGE-1`, which governs clipboard content arriving as untrusted input.
  - iOS: pasteboard items with an expiry, or a local-only pasteboard.
  - Android: clip data flagged as sensitive so it is excluded from clipboard previews.
  - *Review check:* search the diff for clipboard writes; for each, confirm a user initiated it and that the value is not a token, password, or full account identifier.

## Network & Transport Security

- `SEC-NET-1` All network calls use HTTPS/TLS; no cleartext traffic exceptions (`android:usesCleartextTraffic`, `NSAppTransportSecurity` ATS exceptions) except for a documented, reviewed reason.
- `SEC-NET-2` Certificate/public-key pinning is applied on endpoints handling auth or sensitive financial/health data.
- `SEC-NET-3` No disabling of TLS certificate validation anywhere reachable from a production build path, including code reachable only in a debug/build-variant branch that could be misconfigured into production.
  - React Native: `__DEV__`-gated code or an env flag.
  - iOS: `#if DEBUG` branches.
  - Android: `BuildConfig.DEBUG` / build-type-gated code.
  - React: `process.env.NODE_ENV`-gated code.

## Authentication & Session/Token Handling

- `SEC-AUTH-1` Access/refresh tokens are stored per `SEC-STORAGE-1`, never in plain storage, logs, or URLs/query params.
- `SEC-AUTH-2` Token refresh handles expiry and failure without silently retrying indefinitely or falling back to an unauthenticated state that looks authenticated.
- `SEC-AUTH-3` Biometric auth (Face ID / Touch ID / BiometricPrompt) gates local access to an already-issued credential — it is not used as a substitute for server-side authentication.
- `SEC-AUTH-4` Logout clears all cached credentials, tokens, and sensitive in-memory/persisted state, not just navigation to a login screen.

## Browser Session & Cookie Handling

Browser-delivered surfaces have no OS-backed secure store, so session handling itself carries the protection. These rules make normative what `SEC-STORAGE-1`'s React example already recommends; they do not replace it.

- `SEC-COOKIE-1` **[web only]** Cookies carrying a session or authentication token are set `httpOnly` (unreadable from script), `Secure` (sent only over TLS, per `SEC-NET-1`), and with an explicit `SameSite` value chosen for the flow rather than left to the browser default.
  - *Review check:* inspect every `Set-Cookie` the app relies on; a session cookie missing `httpOnly` or `Secure` is a finding regardless of environment.
- `SEC-COOKIE-2` **[web only]** Access and refresh tokens are not persisted in `localStorage`, `sessionStorage`, `IndexedDB`, or any other script-readable store — a successful XSS (see `SEC-WEB-1`) reads all of them. Prefer an `httpOnly` cookie; where a token must reach script, keep it in memory only and re-acquire it after reload.
  - *Review check:* search the diff for writes to `localStorage`/`sessionStorage`; for each, confirm the value is neither a credential nor PII.
- `SEC-COOKIE-3` **[web only]** Cookie `Domain` and `Path` are scoped as narrowly as the feature allows, so a cookie is not broadcast to unrelated subdomains or paths that do not need it.
  - *Review check:* confirm a widened `Domain` (for example a parent domain covering several apps) is justified by an actual cross-app need.

## Deep Link & URL Scheme Validation

- `SEC-DEEPLINK-1` Deep link and universal link targets are validated/allowlisted before navigation — no navigating to an arbitrary URL taken directly from link params.
- `SEC-DEEPLINK-2` Deep link params are not trusted for auth or state changes without independent validation (e.g. a link should not be able to log a user in as someone else).
- `SEC-DEEPLINK-3` Android App Links / iOS Associated Domains are used (verified ownership) rather than unverified custom URL schemes where feasible, to reduce link hijacking risk.

## WebView Hardening

- `SEC-WEBVIEW-1` Embedded web content restricts allowed origins to a known allowlist; it is not left open (`*`) for content loading remote or user-influenced pages.
  - React Native: `react-native-webview` `originWhitelist`.
  - iOS: `WKWebView` navigation-policy checks / `WKContentWorld`.
  - Android: `WebView` URL/origin checks in `WebViewClient`.
  - React: `<iframe sandbox>` + a Content-Security-Policy.
- `SEC-WEBVIEW-2` File-system and cross-origin file access in embedded web content is disabled unless there is a specific, documented need.
  - React Native: `allowFileAccess` / `allowUniversalAccessFromFileURLs` (Android-backed props).
  - Android: `WebSettings.setAllowFileAccess` / `setAllowUniversalAccessFromFileURLs`.
  - iOS: `allowFileAccessFromFileURLs` / `allowUniversalAccessFromFileURLs`.
  - React: iframe `sandbox` without `allow-same-origin` where possible.
- `SEC-WEBVIEW-3` Script injected into embedded web content never concatenates unsanitized data (user input, deep link params, API responses) into the injected script string.
  - React Native: `injectedJavaScript` / `injectJavaScript`.
  - iOS: `evaluateJavaScript` / `WKUserScript`.
  - Android: `evaluateJavascript` / `loadUrl("javascript:…")`.
  - React: any dynamically built `<script>`/`eval` into an embedded frame.
- `SEC-WEBVIEW-4` The native capability surface exposed to embedded web content is minimized to only what that page needs.
  - React Native: the message handlers / injected bridge exposed to the WebView.
  - iOS: `WKScriptMessageHandler` methods.
  - Android: `@JavascriptInterface`-annotated methods.
  - React: `postMessage` handlers, with strict origin checks.

## Web Content Security

These apply to any browser-delivered surface — the React (web) platform, and embedded web content a native or React Native app hosts. [WebView Hardening](#webview-hardening) governs the *container* a native app provides; these rules govern the *page* rendered inside any browser context.

- `SEC-WEB-1` **[web only]** Untrusted data — user input, URL parameters, API responses, third-party content — is never rendered as HTML without sanitization. Prefer rendering as text; where markup is genuinely required, sanitize with a maintained library against an allowlist, never a hand-rolled regex or blocklist.
  - React: `dangerouslySetInnerHTML`.
  - Other browser surfaces: `innerHTML`, `outerHTML`, `document.write`, framework raw-HTML directives.
  - *Review check:* search the diff for every raw-HTML sink; for each, trace the value to its source and confirm it is either developer-authored or passed through a sanitizer.
- `SEC-WEB-2` **[web only]** The application is served with a Content-Security-Policy that constrains `script-src` to known origins and avoids `unsafe-inline` and `unsafe-eval`. CSP is defense-in-depth for `SEC-WEB-1`, not a substitute for it.
  - *Review check:* confirm a policy is actually served (header or meta tag) and that a change has not loosened it — adding `unsafe-inline` to make a library work is a finding, not a fix.
- `SEC-WEB-3` **[web only]** State-changing requests are protected against cross-site request forgery — an anti-CSRF token, `SameSite` cookies per `SEC-COOKIE-1`, or an equivalent the backend enforces. Requests using safe methods (`GET`, `HEAD`) do not change state, so they never rely on this protection.
  - *Review check:* for each new state-changing endpoint the client calls, confirm which mechanism protects it; confirm no new `GET` endpoint mutates data.
- `SEC-WEB-4` **[web only]** Third-party scripts loaded at runtime come from known origins, are pinned to a specific version rather than a floating tag, and carry subresource integrity where the origin supports it. A third-party script executes with full page privileges — it can read anything the app can, including the DOM and any script-readable token.
  - *Review check:* review every added `<script src>` or tag-manager injection for origin, version pinning, and what data the vendor can reach. Package-level dependency vetting stays with `SEC-DEPS-1`/`SEC-DEPS-2`.
- `SEC-WEB-5` **[web only]** Redirect and navigation targets derived from user-controllable input are validated against an allowlist before use — no navigating or redirecting to an absolute URL taken from a query parameter, path segment, or referrer. This is the browser-navigation counterpart to `SEC-DEEPLINK-1`.
  - *Review check:* find assignments to `location`/`location.href`, router navigations, and server redirects whose target originates in request data; confirm each validates against an allowlist rather than checking a prefix.
- `SEC-WEB-6` **[web only]** CORS is treated as a browser-enforced read boundary, not an authorization mechanism. Every endpoint enforces authentication and authorization server-side regardless of origin, and `Access-Control-Allow-Origin` is not set to `*` on any endpoint returning user data or accepting credentials.
  - *Review check:* confirm a permissive CORS configuration is not standing in for missing server-side authorization, and that a wildcard origin is never paired with credentialed requests.

## Input Validation at Trust Boundaries

- `SEC-BRIDGE-1` Data crossing a trust boundary from untrusted input into privileged code (deep link params, IPC/intents, clipboard or share input, web-to-native messages) is validated/sanitized on the privileged side — privileged code must not implicitly trust the incoming input.
  - React Native: data crossing the JS→native module bridge / TurboModules.
  - iOS: URL handlers, app extensions, `WKScriptMessageHandler` payloads.
  - Android: `Intent`/`ContentProvider`/`@JavascriptInterface` inputs.
  - React: server/API route handlers, `postMessage` payloads.
- `SEC-BRIDGE-2` User- or link-supplied strings are never interpolated directly into SQL queries or file system paths.

## Third-Party SDK & Dependency Vetting

- `SEC-DEPS-1` New dependencies are scanned for known CVEs using the ecosystem's audit tooling before being added.
  - React Native / React: `npm`/`yarn`/`pnpm audit`, Snyk/Dependabot.
  - iOS: CocoaPods / Swift Package Manager advisories.
  - Android: Gradle dependency-verification / Play SDK Index.
- `SEC-DEPS-2` SDKs requesting broad device permissions or with known data-collection behavior (ad/analytics SDKs) are scrutinized for what data they access and where it's sent.
- `SEC-DEPS-3` Security-sensitive libraries (auth, crypto, storage) are version-pinned rather than left on a floating range.

## Permissions (Least Privilege)

- `SEC-PERMS-1` Any new native permission (camera, location, contacts, microphone, etc.) is justified by an actual feature need in the same change.
- `SEC-PERMS-2` Permissions are scoped as narrowly as the platform allows (e.g. "when in use" location over "always").
- `SEC-PERMS-3` Runtime permission prompts include a clear rationale string explaining why the permission is needed.

## Anti-Tampering & Release Hardening (nice-to-have)

- `SEC-HARDEN-1` Release Android builds have ProGuard/R8 minification/obfuscation enabled.
- `SEC-HARDEN-2` The release build uses the platform's available bytecode/minification/obfuscation to raise the reverse-engineering bar.
  - React Native: Hermes as the JS engine baseline (bytecode is harder to reverse-engineer than raw JS).
  - iOS: compiled Swift/Obj-C with release optimization.
  - Android: R8/ProGuard (see `SEC-HARDEN-1`).
  - React: minified/obfuscated production bundle with source maps withheld from the client.
- `SEC-HARDEN-3` Debugging and inspection channels are disabled in production builds.
  - React Native: remote JS debugging / Hermes inspector off in release.
  - iOS: no debug entitlements in the release configuration.
  - Android: `android:debuggable="false"` in release.
  - React: no devtools hooks or client-served source maps in production.
- `SEC-HARDEN-4` Root/jailbreak detection is applied where the app's risk tier warrants it (e.g. handles payments or regulated data) — not required for all apps.

## Logging & Crash-Reporting Hygiene

- `SEC-LOG-1` No PII, secrets, or tokens are written to any logging or debug-inspection channel.
  - React Native: `console.log`, Flipper, Reactotron.
  - iOS: `print` / `os_log`.
  - Android: `Log.*` / Logcat.
  - React: `console.*`, network/devtools panels.
- `SEC-LOG-2` Crash reporter (Sentry/Crashlytics) breadcrumbs and payloads are checked for sensitive fields, which are redacted before being sent.

## References

- OWASP Mobile Application Security Verification Standard (MASVS) and the Mobile Application Security Testing Guide (MASTG) — the category groupings above map loosely to MASVS's storage, network, auth, and platform-interaction domains.
- OWASP Application Security Verification Standard (ASVS) and the OWASP Top Ten — the `[web only]` sections map loosely to ASVS's session-management, validation/encoding, and configuration domains.
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
