# Payment Flow
Reader checkout -> backend transaction reference -> gateway request -> customer authorization ->
verified callback/webhook -> verify amount/currency/reference -> idempotent success ->
unlock entitlement -> revenue ledger.
Standard: 70% author / 30% platform.
Promoted: 50% author / 50% platform.
