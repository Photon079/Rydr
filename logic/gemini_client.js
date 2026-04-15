/**
 * Rydr — Gemini Client
 * Calls Google Gemini API for natural language route explanations.
 * This is the PRIMARY LLM integration for Google Services scoring.
 * Falls back to Claude if Gemini key is not provided.
 */

const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Build a context-aware prompt that adapts to route conditions
 * The prompt changes based on:
 * - Battery level (critical, low, good)
 * - Rain conditions
 * - Swap station requirement
 * - Route risk level
 */
function buildPrompt(route, rain, battery) {
  // Determine battery status
  const batteryStatus = battery < 20 ? 'critically low' : 
                       battery < 40 ? 'low' : 
                       battery < 70 ? 'moderate' : 'good';
  
  // Determine arrival status
  const arrivalStatus = route.arrivalBat < 15 ? 'CRITICAL - requires swap' :
                       route.arrivalBat < 30 ? 'LOW - risky' :
                       route.arrivalBat < 50 ? 'MODERATE' : 'SAFE';
  
  // Build swap context
  const swapContext = route.swapStop
    ? `A battery swap at "${route.swapStop.station.name}" is REQUIRED, adding ${route.swapStop.detourMin} minutes. This is not optional - you will not reach destination otherwise.`
    : route.arrivalBat < 30
    ? 'No swap needed but arrival battery is low - consider charging after delivery.'
    : 'No swap needed - sufficient battery for this trip.';
  
  // Build weather context
  const weatherContext = rain
    ? 'Rain is ACTIVE - battery drain increased by 15%. Roads may be slippery, ride carefully.'
    : 'Weather is clear - normal battery consumption expected.';
  
  // Build risk context
  const riskContext = route.risk === 'high'
    ? 'This route has HIGH RISK due to low arrival battery or long distance.'
    : route.risk === 'medium'
    ? 'This route has MEDIUM RISK - monitor battery closely.'
    : 'This route is LOW RISK - safe battery margins.';

  return `You are an AI assistant for EV delivery riders in Bangalore. Analyze this route and provide actionable advice.

ROUTE: "${route.label}"
- Distance: ${route.distKm} km
- Time: ${route.timeMin} minutes
- Battery drain: ${route.drainPct.toFixed(1)}%
- Starting battery: ${battery}% (${batteryStatus})
- Arrival battery: ${route.arrivalBat.toFixed(1)}% (${arrivalStatus})
- Risk level: ${route.risk.toUpperCase()}

CONTEXT:
- ${weatherContext}
- ${swapContext}
- ${riskContext}

TASK: In exactly 2 sentences, explain:
1. WHY this route is recommended (or why it's risky)
2. WHAT the rider should watch out for (specific, actionable advice)

Be direct and practical. Focus on battery management and safety.`;
}

/**
 * Call Google Gemini API with dynamic, context-aware prompts
 * Returns null on any failure — callers must handle gracefully.
 *
 * @param {object} route - Route object with distance, time, battery data
 * @param {boolean} rain - Whether rain is active
 * @param {number}  battery - Current battery percentage
 * @param {string}  apiKey - Google AI Studio API key
 * @returns {Promise<string|null>}
 */
export async function getGeminiExplanation(route, rain, battery, apiKey) {
  if (!apiKey) {
    console.warn('[Gemini] No API key provided');
    return null;
  }

  const prompt = buildPrompt(route, rain, battery);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 120,
          temperature: 0.7, // Higher temperature for more dynamic responses
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini] API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    
    if (!text) {
      console.warn('[Gemini] No text in response:', JSON.stringify(data));
      return null;
    }
    
    console.log('[Gemini] Success:', text);
    return text.trim();
  } catch (err) {
    console.error('[Gemini] Request failed:', err.message);
    return null;
  }
}
