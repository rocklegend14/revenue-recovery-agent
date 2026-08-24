const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Two-tier model strategy — both tiers use Flash-Lite models, which are
// confirmed free-tier with generous rate limits and the lowest cost if
// you ever do exceed the free quota. Safer choice than standard Flash
// models for a project with no billing set up.
// - FAST_MODEL (3.1 Flash-Lite): default for most diagnosis calls
// - DEEP_MODEL (3.5 Flash-Lite): used for high-value cases needing more care
const FAST_MODEL = 'gemini-3.1-flash-lite';
const DEEP_MODEL = 'gemini-3.5-flash-lite';

// Amount threshold (in paise) above which we use the deeper model —
// higher-value failures deserve more careful reasoning before deciding an action.
const HIGH_VALUE_THRESHOLD_PAISE = 500000; // ₹5,000

function getModel(modelName) {
  return genAI.getGenerativeModel({ model: modelName });
}

// Used when an error_reason doesn't match our known rule table.
// The LLM only REASONS about the cause and suggests an action —
// it never makes the final bounded decision, that stays in the decision engine.
async function diagnoseWithLLM({ error_code, error_description, amount_paise }) {
  const chosenModelName = amount_paise >= HIGH_VALUE_THRESHOLD_PAISE ? DEEP_MODEL : FAST_MODEL;
  const model = getModel(chosenModelName);
  const amountRupees = (amount_paise / 100).toFixed(2);

  const prompt = `You are a payment failure diagnosis assistant for an Indian payments platform (Razorpay).
A payment failed with the following details:

Error code: ${error_code || 'unknown'}
Error description: ${error_description || 'not provided'}
Amount: ₹${amountRupees}

This error is not in our known taxonomy. Based on the description, classify the likely cause and recommend ONE action from this fixed list only:
- immediate_retry_link
- delayed_retry_link
- suggest_alternate_method
- gentle_nudge_only
- escalate_to_human

Respond ONLY with valid JSON in this exact shape, no markdown, no extra text:
{"cause": "short_snake_case_label", "confidence": "high|medium|low", "recommended_action": "one_of_the_five_above", "reasoning": "one sentence explaining why"}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Guard against the model inventing an action outside our fixed set —
    // if it does, fall back to escalation rather than trusting an unbounded action.
    const allowedActions = [
      'immediate_retry_link',
      'delayed_retry_link',
      'suggest_alternate_method',
      'gentle_nudge_only',
      'escalate_to_human'
    ];
    if (!allowedActions.includes(parsed.recommended_action)) {
      parsed.recommended_action = 'escalate_to_human';
      parsed.reasoning += ' (action overridden to escalate_to_human: model suggested an action outside the allowed set)';
    }

    return { ...parsed, source: 'llm_inference', model_used: chosenModelName };
  } catch (err) {
    console.error(`LLM diagnosis failed (model: ${chosenModelName}), defaulting to escalation:`, err.message);
    return {
      cause: 'unclassified',
      confidence: 'low',
      recommended_action: 'escalate_to_human',
      reasoning: `LLM diagnosis failed or returned invalid output (model: ${chosenModelName}). Defaulting to human escalation as a safe fallback.`,
      source: 'llm_error_fallback',
      model_used: chosenModelName
    };
  }
}

module.exports = { diagnoseWithLLM };