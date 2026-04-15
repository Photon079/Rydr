/**
 * Rydr — Gemini Client
 * Calls Google Gemini API for natural language route explanations.
 * This is the PRIMARY LLM integration for Google Services scoring.
 * Falls back to Claude if Gemini key is not provided.
 */

const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Build a concise prompt summarising the top route.
 */
function buildPrompt(route, rain, battery) {
  const swapNote = route.swapStop
    ? `A battery swap stop at "${route.swapStop.station.name}" adds ${route.swapStop.detourMin} minutes.`
    : 'No swap stop needed.';

  return `You are a helpful assistant for EV delivery riders in Bangalore.
The best route is "${route.label}": ${route.distKm} km, ${route.timeMin} min, uses ${route.drainPct.toFixed(1)}% battery, leaving ${route.arrivalBat.toFixed(1)}% on arrival. Risk: ${route.risk}. ${swapNote} Rain is ${rain ? 'ON' : 'OFF'}. Starting battery: ${battery}%.
In exactly 2 sentences, explain why this route is recommended and what the rider should watch out for.`;
}

/**
 * Call Google Gemini API and return a natural language explanation.
 * Returns null on any failure — callers must handle gracefully.
 *
 * @param {object} route
 * @param {boolean} rain
 * @param {number}  battery
 * @param {string}  apiKey   Google AI Studio API key
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
          maxOutputTokens: 100,
          temperature: 0.5,
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
