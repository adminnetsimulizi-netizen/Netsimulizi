# Mobile Security

- HTTPS/TLS only.
- Short-lived access tokens + refresh rotation.
- Secure OS credential/key storage.
- Certificate pinning may be considered after operational testing.
- Server-side entitlement checks.
- No client-side trust for wallet balances or purchase status.
- Dynamic watermark on protected content.
- Android FLAG_SECURE where supported.
- iOS capture detection where supported.
- Obfuscate/release-build hardening.
- Do not ship payment/API secrets in the app.
