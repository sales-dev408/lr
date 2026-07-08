CREATE TABLE IF NOT EXISTS pos_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('square', 'clover', 'toast', 'stripe')),
  mode text NOT NULL DEFAULT 'simulated' CHECK (mode IN ('real', 'simulated')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  merchant_id text NULL,
  location_id text NULL,
  access_token_enc text NULL,
  refresh_token_enc text NULL,
  token_expires_at timestamptz NULL,
  scope text NULL,
  last_synced_at timestamptz NULL,
  last_error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, provider)
);

CREATE TABLE IF NOT EXISTS pos_discount_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES pos_connections(id) ON DELETE CASCADE,
  discount_id uuid NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  external_discount_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, discount_id)
);

CREATE TABLE IF NOT EXISTS pos_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES pos_connections(id) ON DELETE CASCADE,
  discount_id uuid NULL REFERENCES discounts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('upsert', 'delete')),
  external_discount_id text NULL,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  message text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pos_connections_vendor_idx ON pos_connections (vendor_id, provider);
CREATE INDEX IF NOT EXISTS pos_discount_mappings_discount_idx ON pos_discount_mappings (discount_id);
CREATE INDEX IF NOT EXISTS pos_sync_logs_connection_idx ON pos_sync_logs (connection_id, created_at DESC);
