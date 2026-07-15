alter table entitlements
  add column if not exists revoked_reason text,
  add column if not exists revoked_by_dispute_id text;

alter table payment_disputes
  add column if not exists last_event_type text,
  add column if not exists stripe_event_created_at timestamptz,
  add column if not exists revoked_entitlement_id uuid,
  add column if not exists revoked_entitlement_active boolean,
  add column if not exists revoked_entitlement_source text,
  add column if not exists revoked_entitlement_expires_at timestamptz,
  add column if not exists revocation_applied_at timestamptz,
  add column if not exists restoration_applied_at timestamptz;

create index if not exists payment_disputes_open_revocation_idx
  on payment_disputes (purchase_id, revocation_applied_at)
  where revocation_applied_at is not null and restoration_applied_at is null;
