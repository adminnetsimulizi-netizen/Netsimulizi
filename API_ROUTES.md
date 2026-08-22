# Core API Routes

POST /api/auth/register-reader
POST /api/auth/login
POST /api/auth/refresh

GET /api/languages
GET /api/categories
GET /api/stories
GET /api/stories/:id
GET /api/stories/:id/chapters

POST /api/reader/progress
POST /api/reader/bookmarks
POST /api/reader/chapters/:id/unlock
GET /api/reader/chapters/:id/content

POST /api/author/stories
POST /api/author/stories/:id/chapters
POST /api/author/stories/:id/submit

GET /api/admin/submissions
POST /api/admin/submissions/:id/approve
POST /api/admin/submissions/:id/reject

GET /api/wallet
GET /api/wallet/transactions
POST /api/payments/create
POST /api/payments/webhook

POST /api/author/withdrawals
GET /api/author/withdrawals

POST /api/author/promotions
GET /api/author/promotions
