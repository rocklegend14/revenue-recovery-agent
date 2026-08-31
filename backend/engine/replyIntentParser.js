const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

const ALLOWED_INTENTS = ['promised_to_pay', 'already_paid', 'opt_out', 'unclear'];

// Parses free text like "I'll pay tomorrow" or "already paid this yesterday"
// into a structured intent. Bounded output, same pattern as the diagnosis engine:
// the LLM only classifies — it never decides what action to take with the result.
async function parseReplyIntent(rawText) {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `A customer replied to a payment recovery message. Today's date is ${today}.
Customer's reply: "${rawText}"

Classify their intent into exactly one of: promised_to_pay, already_paid, opt_out, unclear.
If they gave or implied a specific date/timeframe for paying (e.g. "tomorrow", "next week", "on the 5th"), resolve it to an actual date based on today's date.

Respond ONLY with valid JSON, no markdown:
{"intent": "one_of_the_four_above", "promised_date": "YYYY-MM-DD or null", "confidence": "high|medium|low"}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    if (!ALLOWED_INTENTS.includes(parsed.intent)) {
      return { intent: 'unclear', promised_date: null, confidence: 'low' };
    }
    return parsed;
  } catch (err) {
    console.error('Reply intent parsing failed, defaulting to unclear:', err.message);
    return { intent: 'unclear', promised_date: null, confidence: 'low' };
  }
}

module.exports = { parseReplyIntent, ALLOWED_INTENTS };