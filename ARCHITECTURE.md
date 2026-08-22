# Deployment Architecture
CDN/HTTPS -> Web/Mobile/Admin/Author -> API -> Database/Storage/Payments. Production should separate frontend, API, managed PostgreSQL, storage/CDN, payment provider, notifications and secrets.
