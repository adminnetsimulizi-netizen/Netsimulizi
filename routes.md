# Net Simulizi Development API

Core endpoint contract:

AUTH
POST /api/auth/register-reader
POST /api/auth/login
POST /api/auth/logout

LANGUAGE/CATALOGUE
GET /api/languages
GET /api/stories?language=sw
GET /api/stories?language=en
GET /api/stories/:id
GET /api/stories/:id/chapters

READER
GET /api/me/library
POST /api/reader/progress
POST /api/reader/bookmarks
GET /api/reader/entitlement/:chapterId

AUTHOR
GET /api/author/stories
POST /api/author/stories
POST /api/author/stories/:id/submit
POST /api/author/stories/:id/declaration

ADMIN
POST /api/admin/authors
GET /api/admin/submissions
POST /api/admin/submissions/:id/approve
POST /api/admin/submissions/:id/reject
GET /api/admin/withdrawals
POST /api/admin/withdrawals/:id/process
GET /api/admin/promotions
POST /api/admin/promotions/:id/approve

PAYMENTS
POST /api/payments/create
POST /api/payments/webhook
