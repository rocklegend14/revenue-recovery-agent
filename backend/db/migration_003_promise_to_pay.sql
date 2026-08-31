-- Tracks customer-stated intent captured via the "manage this payment" response page.
CREATE TABLE IF NOT EXISTS commitments (
  id SERIAL PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL,
  intent VARCHAR(32) NOT NULL,          -- promised_to_pay, already_paid, opt_out, unclear
  promised_date DATE,                    -- only set when intent = promised_to_pay
  raw_text TEXT,                         -- what the customer actually typed/selected
  status VARCHAR(16) DEFAULT 'active',   -- active, fulfilled, broken, superseded
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitments_payment_id ON commitments(payment_id);

-- A unique, unguessable token per recovery action, used to build the public response link.
ALTER TABLE recovery_actions ADD COLUMN IF NOT EXISTS response_token VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_response_token ON recovery_actions(response_token);