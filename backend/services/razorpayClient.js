const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Creates a real Razorpay Payment Link (test mode) and triggers notification.
async function createPaymentLink({ amountPaise, contact, email, description, callbackUrl }) {
  const expireBy = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // expires in 24h — bounded, not open-ended

  const link = await razorpay.paymentLink.create({
    amount: amountPaise,
    currency: 'INR',
    description,
    customer: {
      contact,
      email
    },
    notify: {
      sms: !!contact,
      email: !!email
    },
    reminder_enable: false, // we control re-notification ourselves via the decision engine's cooldown logic, not Razorpay's auto-reminders
    expire_by: expireBy,
    callback_url: callbackUrl,
    callback_method: 'get'
  });

  return {
    payment_link_id: link.id,
    payment_link_url: link.short_url,
    status: link.status
  };
}

module.exports = { createPaymentLink };