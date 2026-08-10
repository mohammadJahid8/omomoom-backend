import config from '../../../config';
import { PriceTier, TagType } from '../../../generated/prisma/enums';
import logger from '../../../shared/logger';
import prisma from '../../../shared/prisma';
import { buildWhere } from '../restaurant/restaurant.service';

export type ParsedQuery = {
  filters: {
    cuisine: string[];
    area: string[];
    dish: string[];
    occasion: string[];
    dietary: string[];
    price: string[];
    q: string;
  };

  explanation: string;

  usedAi: boolean;
};

type Vocabulary = {
  cuisine: string[];
  area: string[];
  dish: string[];
  occasion: string[];
  dietary: string[];
};

let cache: { value: Vocabulary; expiresAt: number } | null = null;
const VOCAB_TTL_MS = 10 * 60 * 1000;

async function getVocabulary(): Promise<Vocabulary> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const [tags, areas] = await Promise.all([
    prisma.tag.findMany({
      where: {
        isActive: true,
        type: {
          in: [
            TagType.CUISINE,
            TagType.DISH,
            TagType.OCCASION,
            TagType.DIETARY,
          ],
        },
      },
      select: { type: true, slug: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.neighborhood.findMany({
      where: { isActive: true },
      select: { slug: true },
    }),
  ]);

  const byType = (type: TagType) =>
    tags.filter((tag) => tag.type === type).map((tag) => tag.slug);

  const value: Vocabulary = {
    cuisine: byType(TagType.CUISINE),
    dish: byType(TagType.DISH),
    occasion: byType(TagType.OCCASION),
    dietary: byType(TagType.DIETARY),
    area: areas.map((area) => area.slug),
  };

  cache = { value, expiresAt: Date.now() + VOCAB_TTL_MS };
  return value;
}

const SYSTEM_INSTRUCTION = `
You convert a diner's request into restaurant search filters for a Miami restaurant guide.

Rules:
- Only ever use slugs that appear in the vocabulary you are given. Never invent one.
- If part of the request has no matching slug, leave that group empty and put the
  useful words in "q" instead so text search can handle them.
- Price: ONE is cheap, TWO is moderate, THREE is upscale, FOUR is fine dining.
  "cheap" or "affordable" is ONE and TWO. "fancy", "splurge" or "special occasion"
  is THREE and FOUR. Leave empty when price is not mentioned.
- Neighborhoods only go in "area". Never put a neighborhood in "q".
- "q" should hold only leftover distinguishing words, or be empty. Do not repeat
  the whole request in it.
- "explanation" is one short sentence, written to the diner, saying what you
  looked for. No preamble.
`.trim();

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    cuisine: { type: 'array', items: { type: 'string' } },
    area: { type: 'array', items: { type: 'string' } },
    dish: { type: 'array', items: { type: 'string' } },
    occasion: { type: 'array', items: { type: 'string' } },
    dietary: { type: 'array', items: { type: 'string' } },
    price: { type: 'array', items: { type: 'string' } },
    q: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: [
    'cuisine',
    'area',
    'dish',
    'occasion',
    'dietary',
    'price',
    'q',
    'explanation',
  ],
} as const;

const AI_TIMEOUT_MS = 8000;

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

async function callGemini(
  query: string,
  vocabulary: Vocabulary,
): Promise<Record<string, unknown> | null> {
  const prompt = [
    'Vocabulary (use these slugs only):',
    `cuisine: ${vocabulary.cuisine.join(', ')}`,
    `area: ${vocabulary.area.join(', ')}`,
    `dish: ${vocabulary.dish.join(', ')}`,
    `occasion: ${vocabulary.occasion.join(', ')}`,
    `dietary: ${vocabulary.dietary.join(', ')}`,
    'price: ONE, TWO, THREE, FOUR',
    '',
    `Request: "${query}"`,
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
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        'Gemini request failed, falling back to text search',
      );
      return null;
    }

    const body = (await response.json()) as GeminiResponse;
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    logger.warn(
      { err: error },
      'Gemini call failed, falling back to text search',
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const keepKnown = (value: unknown, allowed: string[]): string[] => {
  if (!Array.isArray(value)) return [];
  const set = new Set(allowed);
  return [...new Set(value.map(String).filter((slug) => set.has(slug)))];
};

const PRICE_VALUES = new Set(Object.keys(PriceTier));

const parseQuery = async (rawQuery: string): Promise<ParsedQuery> => {
  const query = rawQuery.trim().slice(0, 200);

  const fallback = (explanation: string): ParsedQuery => ({
    filters: {
      cuisine: [],
      area: [],
      dish: [],
      occasion: [],
      dietary: [],
      price: [],
      q: query,
    },
    explanation,
    usedAi: false,
  });

  if (!query) return fallback('Nothing to search for yet.');
  if (!config.gemini.enabled) {
    return fallback(`Searching for "${query}".`);
  }

  const vocabulary = await getVocabulary();
  const parsed = await callGemini(query, vocabulary);

  if (!parsed) return fallback(`Searching for "${query}".`);

  const filters = {
    cuisine: keepKnown(parsed.cuisine, vocabulary.cuisine),
    area: keepKnown(parsed.area, vocabulary.area),
    dish: keepKnown(parsed.dish, vocabulary.dish),
    occasion: keepKnown(parsed.occasion, vocabulary.occasion),
    dietary: keepKnown(parsed.dietary, vocabulary.dietary),
    price: keepKnown(parsed.price, [...PRICE_VALUES]),
    q: typeof parsed.q === 'string' ? parsed.q.trim().slice(0, 120) : '',
  };

  const matchedSomething =
    filters.cuisine.length +
      filters.area.length +
      filters.dish.length +
      filters.occasion.length +
      filters.dietary.length +
      filters.price.length >
    0;

  if (!matchedSomething && !filters.q) filters.q = query;

  const modelExplanation =
    typeof parsed.explanation === 'string' && parsed.explanation
      ? parsed.explanation.slice(0, 240)
      : `Searching for "${query}".`;

  if (!matchedSomething) {
    return { filters, explanation: modelExplanation, usedAi: true };
  }

  if ((await countMatches(filters)) > 0) {
    return { filters, explanation: modelExplanation, usedAi: true };
  }

  const RELAX_ORDER = [
    { key: 'dietary', label: 'the dietary filter' },
    { key: 'occasion', label: 'the occasion' },
    { key: 'price', label: 'the price range' },
    { key: 'q', label: 'some of the wording' },
    { key: 'cuisine', label: 'the cuisine' },
    { key: 'dish', label: 'the dish' },
    { key: 'area', label: 'the neighborhood' },
  ] as const;

  const candidate = { ...filters };
  const relaxed: string[] = [];

  for (const { key, label } of RELAX_ORDER) {
    if (key === 'q' ? !candidate.q : candidate[key].length === 0) continue;

    if (key === 'q') candidate.q = '';
    else candidate[key] = [];
    relaxed.push(label);

    if ((await countMatches(candidate)) > 0) {
      return {
        filters: candidate,
        explanation: `${modelExplanation} Nothing matched all of that, so we relaxed ${list(relaxed)}.`,
        usedAi: true,
      };
    }
  }

  return {
    filters: candidate,
    explanation: 'We could not find anything matching that.',
    usedAi: true,
  };
};

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

async function countMatches(filters: ParsedQuery['filters']): Promise<number> {
  return prisma.restaurant.count({ where: buildWhere(filters) });
}

export const AiService = { parseQuery };
