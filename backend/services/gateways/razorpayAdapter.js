const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

async function createPaymentLink({ amountPaise, contact, email, description, callbackUrl }) {
  const expireBy = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24h, bounded not open-ended

  const link = await razorpay.paymentLink.create({
    amount: amountPaise,
    currency: 'INR',
    description,
    customer: { contact, email },
    notify: { sms: !!contact, email: !!email },
    reminder_enable: false, // our own decision engine controls re-notification timing, not the gateway's
    expire_by: expireBy,
    callback_url: callbackUrl,
    callback_method: 'get'
  });

  return { linkId: link.id, linkUrl: link.short_url, status: link.status };
}

function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return expected === signatureHeader;
}

// Translates Razorpay's specific event shape into the app's normalized shape.
function parseWebhookPayload(rawBody) {
  const payload = JSON.parse(rawBody);
  const razorpayEvent = payload.event;

  const EVENT_MAP = {
    'payment.failed': 'payment_failed',
    'payment.authorized': 'payment_authorized',
    'payment_link.paid': 'payment_link_paid'
  };
  const eventType = EVENT_MAP[razorpayEvent] || 'unhandled';

  let payment = null;
  if (eventType === 'payment_failed' || eventType === 'payment_authorized') {
    const p = payload.payload.payment.entity;
    payment = {
      id: p.id,
      amountPaise: p.amount,
      currency: p.currency || 'INR',
      errorCode: p.error_code || null,
      errorReason: p.error_reason || null,
      errorDescription: p.error_description || null,
      contact: p.contact || null,
      email: p.email || null
    };
  }

  let paymentLink = null;
  if (eventType === 'payment_link_paid') {
    const pl = payload.payload.payment_link.entity;
    paymentLink = { id: pl.id, amountPaidPaise: pl.amount_paid };
  }

  return { eventType, payment, paymentLink };
}

module.exports = { createPaymentLink, verifyWebhookSignature, parseWebhookPayload };