// Active gateway is chosen by env var, defaulting to Razorpay. Adding a new
// gateway later: write services/gateways/stripeAdapter.js matching the same
// shape as razorpayAdapter.js, add it here, done — no other file changes.

const razorpayAdapter = require('./razorpayAdapter');

const GATEWAYS = {
  razorpay: razorpayAdapter
  // stripe: require('./stripeAdapter'),
  // payu: require('./payuAdapter'),
};

const activeGateway = GATEWAYS[process.env.PAYMENT_GATEWAY || 'razorpay'];

if (!activeGateway) {
  throw new Error(`Unknown PAYMENT_GATEWAY "${process.env.PAYMENT_GATEWAY}". Available: ${Object.keys(GATEWAYS).join(', ')}`);
}

module.exports = activeGateway;