# API Surface

Authentication:
POST /auth/register-reader
POST /auth/login
POST /auth/logout
POST /auth/refresh

Stories:
GET /stories
GET /stories/:id
POST /author/stories
POST /author/stories/:id/submit
POST /author/stories/:id/chapters
POST /author/chapters/:id/submit

Reader:
POST /reader/chapters/:id/unlock
GET /reader/chapters/:id/secure-content
POST /reader/progress
POST /reader/bookmarks

Wallet:
GET /wallet
POST /wallet/topup
GET /wallet/transactions

Withdrawals:
POST /author/withdrawals
GET /author/withdrawals

Promotion:
POST /author/promotions
GET /author/promotions

Admin:
GET /admin/submissions
POST /admin/submissions/:id/approve
POST /admin/submissions/:id/reject
GET /admin/withdrawals
POST /admin/withdrawals/:id/approve
POST /admin/withdrawals/:id/mark-paid
GET /admin/copyright-complaints
POST /admin/copyright-complaints/:id/action
