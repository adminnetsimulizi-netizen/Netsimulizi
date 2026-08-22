# Phase 2 Setup

1. Install Node.js LTS and PostgreSQL.
2. Create a PostgreSQL database.
3. Run database/schema.sql.
4. Copy config/.env.example to .env and set secrets.
5. Install dependencies in web/ and backend/.
6. Implement provider-specific payment webhook before production.
7. Configure object storage/CDN for covers and protected content.

Production payment credentials and signing keys must never be committed to source control.
