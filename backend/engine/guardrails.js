// Hard limits the decision engine enforces. These are deliberately NOT
// configurable by the LLM — they are fixed policy, which is what makes
// the agent's actions "bounded" rather than open-ended.

// Reason-aware retry timing, modeled on the idea behind real card-network
// guidance (e.g. Mastercard's Merchant Advice Codes): different failure
// causes warrant different retry behavior, not one flat cooldown for everyone.
//   - cooldown_hours: minimum gap before retrying this specific cause
//   - max_attempts: retry cap specific to this cause
//   - retryable: if false, this cause goes straight to escalation/alternate
//     method after the first attempt — repeated retries would be wasted
//     effort (or, on a real card network, risk penalty fees for excessive
//     retries on a decline the network already told you not to retry).
const RETRY_POLICY = {
  otp_incorrect:          { cooldown_hours: 1,  max_attempts: 3, retryable: true },
  timeout:                { cooldown_hours: 1,  max_attempts: 3, retryable: true },
  bank_downtime:          { cooldown_hours: 6,  max_attempts: 3, retryable: true },
  customer_bank_downtime: { cooldown_hours: 6,  max_attempts: 3, retryable: true },
  payment_declined:       { cooldown_hours: 48, max_attempts: 1, retryable: false }, // hard-decline-like: don't hammer the same rail
  user_cancelled:         { cooldown_hours: 24, max_attempts: 2, retryable: true }
};

const DEFAULT_POLICY = { cooldown_hours: 6, max_attempts: 3, retryable: true };

function getRetryPolicy(cause) {
  return RETRY_POLICY[cause] || DEFAULT_POLICY;
}

module.exports = {
  RETRY_POLICY,
  getRetryPolicy,
  MAX_RETRY_ATTEMPTS: 3,           // fallback cap used only when a cause has no specific policy
  COOLDOWN_HOURS: 6,               // fallback cooldown used only when a cause has no specific policy
  ESCALATE_AFTER_ATTEMPTS: 3       // fallback escalation threshold used only when a cause has no specific policy
};