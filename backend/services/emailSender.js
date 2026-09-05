// Uses Resend (resend.com) for transactional email. One API key, free tier
// (100 emails/day), no personal email account or app-password setup needed —
// unlike a Gmail/nodemailer approach, this works the same way for any
// merchant who deploys this system, not just the original developer.

const RESEND_API_URL = 'https://api.resend.com/emails';

// IANA reserved for documentation/testing — these can never receive real
// mail (that's the whole point of them existing), which is exactly why the
// synthetic batch generator uses them for fake customer emails. Skipping
// the Resend call for these avoids a noisy, expected 422 in the logs for
// every simulated record — the real Payment Link (Razorpay's own SMS/email)
// still goes out regardless, since this only skips the supplementary email.
const NON_DELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net'];

function isNonDeliverable(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase();
  return NON_DELIVERABLE_DOMAINS.includes(domain);
}

async function sendRecoveryEmail({ to, amountRupees, paymentLinkUrl, manageLink, cause }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping custom recovery email (gateway\'s native notification still sends).');
    return false;
  }

  if (isNonDeliverable(to)) {
    console.log(`Skipping custom recovery email for ${to} — synthetic/reserved domain, not real (gateway's native notification still sends).`);
    return false;
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 480px;">
      <p>Your recent payment of <strong>₹${amountRupees}</strong> didn't go through${cause ? ` (${cause.replace(/_/g, ' ')})` : ''}.</p>
      <p><a href="${paymentLinkUrl}" style="display:inline-block;padding:10px 16px;background:#3ECF8E;color:#0B1220;text-decoration:none;border-radius:6px;font-weight:600;">Complete your payment</a></p>
      <p style="margin-top:16px;color:#555;font-size:14px;">
        Can't pay right now, already paid, or want us to stop reaching out?
        <a href="${manageLink}">Let us know here</a>.
      </p>
    </div>
  `;

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev', // Resend's default sender works with zero setup for testing
        to,
        subject: `Action needed: complete your ₹${amountRupees} payment`,
        html
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend email failed:', res.status, errText);
      return false;
    }
    console.log(`Recovery email sent to ${to} via Resend`);
    return true;
  } catch (err) {
    console.error('Failed to send recovery email:', err.message);
    return false;
  }
}

module.exports = { sendRecoveryEmail };