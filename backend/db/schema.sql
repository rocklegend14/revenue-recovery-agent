-- payment_events: raw events received from Razorpay webhooks
CREATE TABLE IF NOT EXISTS payment_events (
  id SERIAL PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,          -- e.g. payment.failed, payment.authorized
  amount_paise INTEGER NOT NULL,             -- always store in paise, convert at display time
  currency VARCHAR(10) DEFAULT 'INR',
  error_code VARCHAR(64),
  error_reason VARCHAR(64),
  error_description TEXT,
  customer_contact VARCHAR(32),
  customer_email VARCHAR(128),
  customer_id VARCHAR(64),
  raw_payload JSONB,                         -- full original webhook payload, for reference
  received_at TIMESTAMP DEFAULT NOW()
);

-- diagnoses: root cause classification for each failed payment
CREATE TABLE IF NOT EXISTS diagnoses (
  id SERIAL PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL,
  cause VARCHAR(64) NOT NULL,                -- e.g. otp_incorrect, bank_downtime
  confidence VARCHAR(16),                    -- high, medium, low
  source VARCHAR(16),                        -- rule_match or llm_inference
  reasoning TEXT,
  recommended_action VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- decisions: what the decision engine chose, with guardrail reasoning
CREATE TABLE IF NOT EXISTS decisions (
  id SERIAL PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL,
  decision VARCHAR(16) NOT NULL,             -- proceed or blocked
  action VARCHAR(64),                        -- send_payment_link, escalate_to_human, none
  channel VARCHAR(16),                       -- sms, email, whatsapp
  attempt_number INTEGER,
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- recovery_actions: what was actually executed and the outcome
CREATE TABLE IF NOT EXISTS recovery_actions (
  id SERIAL PRIMARY KEY,
  payment_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  channel VARCHAR(16),
  payment_link_id VARCHAR(64),
  payment_link_url TEXT,
  sent_at TIMESTAMP DEFAULT NOW(),
  outcome VARCHAR(16),                       -- pending, recovered, failed, expired
  amount_recovered_paise INTEGER DEFAULT 0,
  outcome_at TIMESTAMP
);

-- batches: groups of synthetic/demo records run together for measurement
CREATE TABLE IF NOT EXISTS batches (
  id SERIAL PRIMARY KEY,
  batch_label VARCHAR(64),
  total_records INTEGER,
  total_amount_at_risk_paise INTEGER,
  total_amount_recovered_paise INTEGER,
  recovery_rate NUMERIC(5,4),
  escalated_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by payment_id across tables (used constantly in audit trail queries)
CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON payment_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_payment_id ON diagnoses(payment_id);
CREATE INDEX IF NOT EXISTS idx_decisions_payment_id ON decisions(payment_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_payment_id ON recovery_actions(payment_id);