import config from '../../../config';
import logger from '../../../shared/logger';

const AI_TIMEOUT_MS = 4000;

export type VisitRatings = {
  taste?: number | null;
  service?: number | null;
  value?: number | null;
  ambience?: number | null;
  hygiene?: number | null;
};

/**
 * Taste carries the most weight because this is a food site: a beautiful room
 * does not rescue a bad plate. Only the aspects a person actually filled in
 * count, so a taste-only rating is not dragged down by four blanks.
 */
const WEIGHTS: Record<keyof VisitRatings, number> = {
  taste: 3,
  service: 1.5,
  value: 1.5,
  ambience: 1,
  hygiene: 1,
};

export function visitScore(ratings: VisitRatings): number | null {
  let weighted = 0;
  let total = 0;

  for (const [key, weight] of Object.entries(WEIGHTS) as [
    keyof VisitRatings,
    number,
  ][]) {
    const value = ratings[key];
    if (typeof value !== 'number') continue;
    weighted += value * weight;
    total += weight;
  }

  if (total === 0) return null;

  return Number((weighted / total).toFixed(1));
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

const label = (value: number | null | undefined) =>
  typeof value === 'number' ? `${value}/5` : 'not rated';

/**
 * A one line read on the review. Best effort: if Gemini is not configured, is
 * slow, or errors, the recommendation still saves without a summary.
 */
export async function summarise(input: {
  restaurantName: string;
  dish: string;
  rating: number;
  comment?: string | null;
  ratings: VisitRatings;
}): Promise<string | null> {
  if (!config.gemini.enabled) return null;

  const prompt = [
    `Restaurant: ${input.restaurantName}`,
    `Dish: ${input.dish}`,
    `Dish rating: ${input.rating}/5`,
    `Taste: ${label(input.ratings.taste)}`,
    `Service: ${label(input.ratings.service)}`,
    `Value: ${label(input.ratings.value)}`,
    `Ambience: ${label(input.ratings.ambience)}`,
    `Hygiene: ${label(input.ratings.hygiene)}`,
    input.comment ? `They wrote: "${input.comment}"` : 'They wrote nothing.',
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: [
                  'You write a single sentence summarising one diner\'s review for other diners.',
                  'Maximum 18 words. No quotes, no emoji, no restaurant name, no rating numbers.',
                  'Lead with the dish and whether it is worth ordering.',
                  'Use only what you are given. Never invent detail.',
                ].join(' '),
              },
            ],
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 120,
            // 2.5 models think by default and charge it to the same budget,
            // which leaves nothing for a one-line answer.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Gemini summary failed');
      return null;
    }

    const body = (await response.json()) as GeminiResponse;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    return text ? text.replace(/^["']|["']$/g, '').slice(0, 200) : null;
  } catch (error) {
    logger.warn({ err: error }, 'Gemini summary failed');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
