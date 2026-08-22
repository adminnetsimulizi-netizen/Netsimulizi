# End-to-End Critical Flows

FLOW A — Author publication
Admin creates author -> author creates story -> declaration -> submit ->
admin approves -> story publishes.

FLOW B — Reader purchase
Reader selects language -> opens story -> purchases chapter/story ->
verified payment webhook -> entitlement -> reader access.

FLOW C — Revenue
Normal transaction -> 70/30.
Promoted transaction -> 50/50.

FLOW D — Withdrawal
Balance < TSh 50,000 -> Withdraw unavailable.
Balance >= TSh 50,000 -> Withdraw available -> request -> admin processing -> paid.

FLOW E — Offline
Authorized chapter -> encrypted local cache -> offline read -> reconnect -> sync.
