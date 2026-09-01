// Every payment gateway adapter must implement this exact shape.
// The rest of the app (webhooks, recovery engine) only ever talks to
// this interface, never to a gateway's SDK directly — so adding a new
// gateway means writing one new file here, not touching core logic.
//
// createPaymentLink({ amountPaise, contact, email, description, callbackUrl })
//   -> { linkId, linkUrl, status }
//
// verifyWebhookSignature(rawBody, signatureHeader, secret) -> boolean
//
// parseWebhookPayload(rawBody) -> {
//   eventType: 'payment_failed' | 'payment_authorized' | 'payment_link_paid' | 'unhandled',
//   payment: {
//     id, amountPaise, currency, errorCode, errorReason, errorDescription,
//     contact, email
//   } | null,
//   paymentLink: { id, amountPaidPaise } | null   // only set for payment_link_paid
// }
//
// This normalized shape is what the rest of the codebase reads — gateway-specific
// field names (e.g. Razorpay's `error_reason` vs another gateway's `decline_code`)
// get translated to this common shape inside each adapter, once, in one place.

module.exports = {};