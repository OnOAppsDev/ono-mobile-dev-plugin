# Mobile Security Standards

## Purpose & Scope

These standards apply to app code reviewed by the shared `mobile-security-reviewer` agent via `/review-security`. Each rule states a **platform-neutral requirement** (the normative rule); where a platform's concrete API, library, or tooling adds real value, it appears as a labelled example (React Native / iOS / Android / React). Web-specific concerns for the React platform (XSS/CSRF/CSP) are not yet covered here — see the `standards/react/` stub and the planned shared web-security extension. Categories loosely follow the OWASP Mobile Application Security Verification Standard (MASVS); see [References](#references). Each bullet carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

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
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
