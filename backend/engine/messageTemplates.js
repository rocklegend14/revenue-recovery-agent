// Simple, deterministic message templates per cause. Kept rule-based (not LLM)
// for the Payment Link "description" field since Razorpay's API expects a short,
// plain string here — LLM-generated messaging is reserved for richer channels
// (e.g. a future WhatsApp/SMS body) where more natural phrasing adds real value.

const MESSAGE_TEMPLATES = {
  otp_incorrect: 'Your recent payment needs a quick retry — the OTP entered didn\'t match. Please complete your payment here.',
  timeout: 'Your payment session timed out. Please complete your payment here.',
  bank_downtime: 'Your bank had a temporary issue processing your payment. Please retry here.',
  customer_bank_downtime: 'Your bank had a temporary issue processing your payment. You can also try a different payment method here.',
  payment_declined: 'Your payment did not go through. Please try an alternate payment method here.',
  user_cancelled: 'Looks like your payment was not completed. No rush — you can complete it whenever convenient.'
};

function getRecoveryMessage(cause) {
  return MESSAGE_TEMPLATES[cause] || 'Your payment could not be completed. Please retry here.';
}

module.exports = { getRecoveryMessage };