# Net Simulizi Release Candidate

Release order:
1. Freeze application code.
2. Configure staging secrets.
3. Run database migrations.
4. Run integration and security QA.
5. Run Flutterwave sandbox payment tests.
6. Run PayPal sandbox tests where the merchant account supports them.
7. Verify revenue ledger and withdrawal rules.
8. Run mobile offline/reader tests.
9. Fix and retest all Critical/High defects.
10. Tag the release candidate.
11. Configure production secrets only after approval.
