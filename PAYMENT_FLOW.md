# Payment Flow
1. Create internal transaction reference.
2. Start checkout through selected gateway.
3. Receive provider callback/webhook.
4. Verify signature/authenticity.
5. Verify amount, currency, reference and final provider status.
6. Apply idempotency.
7. Grant entitlement.
8. Write immutable revenue ledger entry.
9. Author balance updates.
10. Platform balance updates.
