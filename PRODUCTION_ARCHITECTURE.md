# Production Architecture

Users
  |
HTTPS / CDN
  |
Web + Mobile + Admin + Author Portal
  |
API / Backend
  |
+---------+-----------+------------+
|         |           |            |
DB      Storage     Payments   Notifications
|
Backups + Monitoring

Recommended:
- managed PostgreSQL
- object storage/CDN
- HTTPS everywhere
- secret manager
- automated database backups
- centralized logs and error monitoring
