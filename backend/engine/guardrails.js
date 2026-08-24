// Hard limits the decision engine enforces. These are deliberately NOT
// configurable by the LLM — they are fixed policy, which is what makes
// the agent's actions "bounded" rather than open-ended.

module.exports = {
  MAX_RETRY_ATTEMPTS: 3,           // stop automated recovery after this many attempts
  COOLDOWN_HOURS: 6,               // minimum gap between two recovery attempts for the same payment
  ESCALATE_AFTER_ATTEMPTS: 3       // attempt number at which a failed case moves to human review
};