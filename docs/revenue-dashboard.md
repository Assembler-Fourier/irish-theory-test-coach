# Revenue Dashboard

The admin dashboard tracks gross revenue, estimated Stripe fees, estimated net revenue, sales by plan, refund count when available, active entitlements, and instructor/referral revenue.

CSV exports:

- Purchases: `/api/admin/export?type=purchases`
- Referrals: `/api/admin/export?type=referrals`

Exports require server-side admin authorization. Do not expose card data, secret keys, webhook secrets, or raw stack traces.
