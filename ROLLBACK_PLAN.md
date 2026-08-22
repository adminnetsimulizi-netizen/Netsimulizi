# Rollback Plan

If a critical production defect appears:
1. Stop the affected release.
2. Preserve logs and transaction records.
3. Roll back application deployment to last known-good version.
4. Do not manually alter financial ledger without an auditable correction.
5. Disable affected payment/content feature if necessary.
6. Verify database compatibility before rollback.
7. Re-run smoke tests.
8. Restore service gradually.
9. Document incident and corrective action.
