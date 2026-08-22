# Offline Reading Architecture

1. User authenticates.
2. User purchases/unlocks a chapter.
3. Server issues an authorized encrypted content package.
4. App stores ciphertext in protected app storage.
5. Encryption key is bound to the authenticated account/device/session policy.
6. App decrypts only inside the reader at runtime.
7. Progress/bookmarks sync when online.
8. Access can expire/revoke according to server policy.

Never store readable story text as plain files in public device storage.
