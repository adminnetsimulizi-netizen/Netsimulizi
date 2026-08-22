# Security Requirements

- Password hashing with Argon2id/bcrypt.
- Short-lived access tokens and refresh-token rotation.
- Role-based access control.
- Server-side ownership checks on every protected endpoint.
- Never trust client-side price, balance or revenue calculations.
- Payment confirmation only from verified gateway callbacks/webhooks.
- Encrypt story content at rest and in offline app storage.
- Use per-user/session authorization for chapter access.
- Dynamic watermark: username/account identifier + timestamp where appropriate.
- Rate limiting and abuse detection.
- Audit logs for admin actions, author submissions, approvals and financial actions.
- Ordinary browser copy/print controls may be applied but are not security boundaries.
- Mobile app may use platform screenshot/screen-recording protections where supported.
