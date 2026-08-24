// Known Razorpay error taxonomy mapped to a recommended recovery action.
// This table is the "bounded" part of diagnosis — anything matching here
// skips the LLM entirely and is resolved deterministically.

const RULE_TABLE = {
  otp_incorrect: {
    cause: 'otp_incorrect',
    recommended_action: 'immediate_retry_link',
    confidence: 'high',
    reasoning: 'Known error code: customer entered incorrect OTP. Likely a simple user error, safe to retry immediately.'
  },
  timeout: {
    cause: 'timeout',
    recommended_action: 'immediate_retry_link',
    confidence: 'high',
    reasoning: 'Known error code: customer exceeded the payment time limit. Likely got distracted, safe to retry immediately.'
  },
  bank_downtime: {
    cause: 'bank_downtime',
    recommended_action: 'delayed_retry_link',
    confidence: 'high',
    reasoning: "Known error code: Razorpay's partner bank had downtime. Recommend delaying retry until downtime likely resolved."
  },
  customer_bank_downtime: {
    cause: 'customer_bank_downtime',
    recommended_action: 'delayed_retry_link',
    confidence: 'high',
    reasoning: "Known error code: customer's own bank had downtime. Recommend delaying retry and suggesting an alternate payment method."
  },
  payment_declined: {
    cause: 'payment_declined',
    recommended_action: 'suggest_alternate_method',
    confidence: 'medium',
    reasoning: "Known error code: bank declined the payment. Razorpay typically doesn't get a detailed reason from the bank, so suggest an alternate payment method rather than blindly retrying the same one."
  },
  user_cancelled: {
    cause: 'user_cancelled',
    recommended_action: 'gentle_nudge_only',
    confidence: 'high',
    reasoning: 'Known error code: customer cancelled intentionally. Recommend a gentle, low-pressure nudge rather than an aggressive retry push.'
  }
};

function lookupRule(errorReason) {
  return RULE_TABLE[errorReason] || null;
}

module.exports = { RULE_TABLE, lookupRule };