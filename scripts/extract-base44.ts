import fs from 'node:fs';
import path from 'node:path';

const CUISINE_MAP: Record<string, string[]> = {
  'american (global coastal)': ['American'],
  'american (market-driven)': ['American'],
  'american / mediterranean': ['American', 'Mediterranean'],
  'american/mediterranean': ['American', 'Mediterranean'],
  'argentinian: ': ['Argentine'],
  argentinian: ['Argentine'],
  asian: ['Asian'],
  'asian wood-fired': ['Asian'],
  'bakery / cafe': ['Bakery', 'Cafe'],
  'bakery & cafe': ['Bakery', 'Cafe'],
  'bangladeshi / indian': ['Indian'],
  barbecue: ['BBQ'],
  'bbq / latin fusion': ['BBQ', 'Latin American'],
  'brewery / american': ['American', 'Bars & Lounges'],
  'cafe / healthy': ['Cafe', 'Healthy'],
  'caribbean fusion': ['Caribbean'],
  'chinese / sushi': ['Chinese', 'Japanese'],
  'chinese-american': ['Chinese', 'American'],
  'chinese-japanese fine dining': ['Chinese', 'Japanese'],
  'coffee and cafe': ['Cafe'],
  'contemporary american': ['American'],
  'deli / mediterranean': ['Mediterranean'],
  'eclectic / american': ['Eclectic', 'American'],
  'food truck (hibachi/teppanyaki)': ['Japanese'],
  'food truck (latin american/american)': ['Latin American', 'American'],
  'food truck (sushi/temaki)': ['Japanese'],
  'french bakery': ['French', 'Bakery'],
  'french brasserie': ['French'],
  'french cafe': ['French', 'Cafe'],
  'haitian / caribbean': ['Haitian', 'Caribbean'],
  'healthy / cafe': ['Healthy', 'Cafe'],
  'healthy / juice bar': ['Healthy'],
  'healthy bowls': ['Healthy'],
  'healthy cafe': ['Healthy', 'Cafe'],
  'israeli steakhouse': ['Israeli', 'Steakhouse'],
  'jamaican / caribbean': ['Jamaican', 'Caribbean'],
  'japanese / sushi': ['Japanese'],
  'japanese buffet': ['Japanese'],
  'japanese fine dining': ['Japanese'],
  'japanese-mediterranean': ['Japanese', 'Mediterranean'],
  'korean bbq': ['Korean'],
  'korean bbq / hot pot': ['Korean'],
  'korean bbq / sushi': ['Korean', 'Japanese'],
  'korean bbq / tofu': ['Korean'],
  'korean fried chicken': ['Korean'],
  latin: ['Latin American'],
  'latin american (venezuelan)': ['Latin American', 'Venezuelan'],
  'latin fusion': ['Latin American'],
  'mandarin chinese': ['Chinese'],
  'mediterranean / persian': ['Mediterranean', 'Persian'],
  'mediterranean-asian fusion': ['Mediterranean', 'Asian'],
  'middle eastern / kosher': ['Middle Eastern'],
  'new american': ['American'],
  'new american / wine bar': ['American', 'Bars & Lounges'],
  'pakistani / indian': ['Indian'],
  'pan-asian': ['Asian'],
  'plant-based': ['Vegan'],
  'russian / eastern european': ['Eastern European'],
  'russian / ukrainian': ['Eastern European'],
  'southeast asian / french': ['Asian', 'French'],
  'southern bbq': ['BBQ', 'Southern'],
  sushi: ['Japanese'],
  'texas bbq': ['BBQ'],
  'thai / japanese': ['Thai', 'Japanese'],
  'trinidadian / caribbean': ['Caribbean'],
  'turkish / mediterranean': ['Turkish', 'Mediterranean'],
  fusion: ['Eclectic'],
  continental: ['European'],
};

const NEIGHBORHOOD_MAP: Record<string, string | null> = {
  'suite 100': null,
  'suite 21': null,
  'g-170': null,
  'fl 9 (gale hotel)': null,
  "l'chaim farms": null,
  'airport area': null,
  'southwest miami-dade': null,

  miami: null,

  'miami design district': 'Design District',
  'design district (paradise plaza)': 'Design District',
  'coconut grove (ritz-carlton)': 'Coconut Grove',
  'coconut grove (cocowalk)': 'Coconut Grove',
  'coral gables (um campus)': 'Coral Gables',
  'downtown coral gables / giralda plaza': 'Coral Gables',
  'brickell (miami river)': 'Brickell',
  'downtown/brickell': 'Brickell',
  downtown: 'Downtown Miami',
  'mid beach': 'Mid-Beach',
  'miami beach (mid-beach)': 'Mid-Beach',
  'miami beach (sunset harbour)': 'Sunset Harbour',
  'mimo / upper eastside': 'Upper East Side',
  'mimo district (upper eastside)': 'Upper East Side',
  'north miami / biscayne blvd': 'North Miami',
  'north miami / el portal': 'North Miami',
  'westchester (coral way)': 'Westchester',
  'bird road (westchester)': 'Westchester',
  'tamiami / westchester area': 'Westchester',
  'westchester / university park': 'Westchester',
  'little gables / tamiami trail': 'Coral Gables',
  'kendall (dadeland)': 'Kendall',
  'university park (fiu)': 'University Park',
  'miami (near wynwood)': 'Wynwood',
  'wynwood (1-800-lucky food hall)': 'Wynwood',
  'flagler / airport west': 'Flagler',
  'davie/hollywood border': 'Davie',
  'seminole hard rock, hollywood': 'Hollywood',
  'south of fifth': 'South of Fifth',
};

const MICHELIN_MAP: Record<string, string> = {
  Selected: 'SELECTED',
  'Bib Gourmand': 'BIB_GOURMAND',
  '⭐1': 'ONE_STAR',
  '⭐2': 'TWO_STARS',
  '⭐3': 'THREE_STARS',
};

const PRICE_MAP: Record<string, string> = {
  '1': 'ONE',
  '2': 'TWO',
  '3': 'THREE',
  '4': 'FOUR',
};

const splitEmoji = (raw: string): { emoji: string | null; label: string } => {
  const match = /^([^\p{L}\p{N}\s]+)\s*(.*)$/u.exec(raw);
  if (!match) return { emoji: null, label: raw.trim() };
  return {
    emoji: (match[1] ?? '').trim() || null,
    label: (match[2] ?? '').trim(),
  };
};

const isFlag = (emoji: string | null): boolean =>
  emoji !== null && /[\u{1F1E6}-\u{1F1FF}]{2}/u.test(emoji);

const FLAG_TO_CUISINE: Record<string, string> = {
  '🇺🇸': 'American',
  '🇯🇵': 'Japanese',
  '🇮🇹': 'Italian',
  '🇲🇽': 'Mexican',
  '🇫🇷': 'French',
  '🇰🇷': 'Korean',
  '🇨🇳': 'Chinese',
  '🇵🇪': 'Peruvian',
  '🇪🇸': 'Spanish',
  '🇦🇷': 'Argentine',
  '🇧🇷': 'Brazilian',
  '🇻🇳': 'Vietnamese',
  '🇹🇭': 'Thai',
  '🇮🇳': 'Indian',
  '🇬🇷': 'Greek',
  '🇨🇺': 'Cuban',
  '🇹🇷': 'Turkish',
  '🇱🇧': 'Lebanese',
  '🇮🇱': 'Israeli',
  '🇨🇴': 'Colombian',
  '🇻🇪': 'Venezuelan',
  '🇯🇲': 'Jamaican',
  '🇭🇹': 'Haitian',
};

type Row = Record<string, string | null>;

function splitTuple(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (c === "'") {
        if (body[i + 1] === "'") {
          cur += "'";
          i++;
        } else {
          inStr = false;
          cur += c;
        }
      } else cur += c;
    } else if (c === "'") {
      inStr = true;
      cur += c;
    } else if (c === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const unquote = (v: string): string | null => {
  if (v === 'NULL' || v === undefined) return null;
  if (v.startsWith("'") && v.endsWith("'"))
    return v.slice(1, -1).replace(/''/g, "'");
  return v;
};

function parseTable(sql: string, table: string): Row[] {
  const rows: Row[] = [];
  const re = new RegExp(`INSERT INTO "${table}" \\(([^)]+)\\) VALUES \\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const cols = (m[1] as string)
      .split(',')
      .map((c) => c.trim().replace(/"/g, ''));
    let depth = 1;
    let inStr = false;
    let body = '';
    for (let i = re.lastIndex; i < sql.length; i++) {
      const c = sql[i] as string;
      if (inStr) {
        if (c === "'") {
          if (sql[i + 1] === "'") {
            body += "''";
            i++;
            continue;
          }
          inStr = false;
        }
        body += c;
        continue;
      }
      if (c === "'") {
        inStr = true;
        body += c;
        continue;
      }
      if (c === '(') depth++;
      if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
      body += c;
    }
    const vals = splitTuple(body).map(unquote);
    const row: Row = {};
    cols.forEach((c, i) => (row[c] = vals[i] ?? null));
    rows.push(row);
  }
  return rows;
}

const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const jsonArray = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const canonicalCuisines = (raw: string | null): string[] => {
  if (!raw) return [];
  const key = raw.trim().toLowerCase();
  if (CUISINE_MAP[key]) return CUISINE_MAP[key];

  if (raw.includes('/')) {
    return raw
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => CUISINE_MAP[p.toLowerCase()] ?? [titleCase(p)]);
  }
  return [titleCase(raw.trim())];
};

const titleCase = (s: string): string =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /(^|\s)(\w)/g,
      (_m, lead: string, ch: string) => lead + ch.toUpperCase(),
    );

const MAX_TAG_LENGTH = 32;

const normaliseTagLabel = (raw: string): string | null => {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/[;.,]+$/, '')
    .trim();

  if (!cleaned) return null;
  if (cleaned.length > MAX_TAG_LENGTH) return null;
  if (/[;]|--|\.\s/.test(cleaned)) return null;
  if ((cleaned.match(/\s/g) ?? []).length > 3) return null;

  return titleCase(cleaned);
};

const KEEP_SINGLETONS = new Set(['CUISINE', 'DISH']);
const MIN_TAG_USES = 3;

const canonicalNeighborhood = (raw: string | null): string | null => {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key in NEIGHBORHOOD_MAP) return NEIGHBORHOOD_MAP[key] ?? null;

  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || null;
};

type SeedRestaurant = {
  externalRef: string;
  name: string;
  slug: string;
  description: string | null;
  subCuisine: string | null;
  signatureDishes: string | null;
  cuisines: string[];
  neighborhood: string | null;
  municipality: string | null;
  addressLine: string | null;
  phone: string | null;
  websiteUrl: string | null;
  menuUrl: string | null;
  reservationUrl: string | null;
  googleMapsUrl: string | null;
  socials: Record<string, string>;
  priceTier: string | null;
  michelin: string | null;
  hoursText: string | null;
  status: 'PUBLISHED' | 'DRAFT';
  imageUrl: string | null;
  internalNotes: string | null;
  tags: { type: string; label: string; emoji: string | null }[];
};

function main(): void {
  const dumpPath = process.argv[2];
  if (!dumpPath || !fs.existsSync(dumpPath)) {
    console.error(
      'Usage: npm run extract:base44 -- "C:/path/to/omomoon_database.sql"',
    );
    process.exit(1);
  }

  const sql = fs.readFileSync(dumpPath, 'utf8');
  const rows = parseTable(sql, 'restaurant');
  console.log(`Read ${rows.length} restaurants from the export\n`);

  const seenSlugs = new Set<string>();
  const warnings: string[] = [];
  const dropped: string[] = [];

  const restaurants: SeedRestaurant[] = rows.map((r) => {
    const name = (r.name ?? '').trim();

    let slug = slugify(name) || 'restaurant';
    if (seenSlugs.has(slug)) {
      const area = canonicalNeighborhood(r.neighborhood) ?? r.city ?? '';
      const withArea = slugify(`${name} ${area}`);
      slug = seenSlugs.has(withArea) ? `${slug}-${r.id?.slice(-4)}` : withArea;
    }
    seenSlugs.add(slug);

    const cuisines = canonicalCuisines(r.cuisine);

    const tags: SeedRestaurant['tags'] = [];
    const push = (type: string, label: string, emoji: string | null = null) => {
      const normalised = normaliseTagLabel(label);
      if (!normalised) {
        dropped.push(label);
        return;
      }
      if (tags.some((t) => t.type === type && t.label === normalised)) return;
      tags.push({ type, label: normalised, emoji });
    };

    for (const c of cuisines) push('CUISINE', c);
    for (const raw of jsonArray(r.tags)) {
      const { emoji, label } = splitEmoji(raw);
      if (label) {
        push(isFlag(emoji) ? 'CUISINE' : 'DISH', label, emoji);
      } else if (emoji && FLAG_TO_CUISINE[emoji]) {
        push('CUISINE', FLAG_TO_CUISINE[emoji]);
      }
    }
    for (const v of jsonArray(r.dietary)) push('DIETARY', v);
    for (const v of jsonArray(r.features)) push('FEATURE', v);
    for (const v of jsonArray(r.good_for)) push('OCCASION', v);
    for (const v of jsonArray(r.drinks)) push('DRINK', v);
    for (const v of jsonArray(r.services)) push('SERVICE', v);
    for (const v of jsonArray(r.parking)) push('PARKING', v);

    const dishes = [
      ...new Set(
        [r.dish, r.must_order]
          .filter(Boolean)
          .flatMap((v) => (v as string).split(','))
          .map((d) => d.trim())
          .filter(Boolean),
      ),
    ].join(', ');

    const socials: Record<string, string> = {};
    if (r.instagram) {
      socials.instagram = r.instagram.startsWith('http')
        ? r.instagram
        : `https://instagram.com/${r.instagram.replace(/^@/, '')}`;
    }
    if (r.social_facebook) socials.facebook = r.social_facebook;
    if (r.social_tiktok) socials.tiktok = r.social_tiktok;
    if (r.social_x) socials.x = r.social_x;
    if (r.social_youtube) socials.youtube = r.social_youtube;

    const michelin =
      r.michelin && r.michelin !== 'None' ? MICHELIN_MAP[r.michelin] : null;
    if (r.michelin && r.michelin !== 'None' && !michelin) {
      warnings.push(`Unmapped michelin value: "${r.michelin}" (${name})`);
    }

    const linkOrNull = (v: string | null) =>
      v && v !== 'Direct' && v.startsWith('http') ? v : null;

    return {
      externalRef: r.id ?? '',
      name,
      slug,
      description: r.description ?? null,
      subCuisine: r.sub_cuisine ?? r.cuisine ?? null,
      signatureDishes: dishes || null,
      cuisines,
      neighborhood: canonicalNeighborhood(r.neighborhood),
      municipality: r.city ?? null,
      addressLine: r.address ?? null,
      phone: r.phone ?? null,
      websiteUrl: linkOrNull(r.website),
      menuUrl: linkOrNull(r.menu_url),
      reservationUrl: linkOrNull(r.reservationLink),
      googleMapsUrl: linkOrNull(r.google_maps),
      socials,
      priceTier: r.price ? (PRICE_MAP[r.price] ?? null) : null,
      michelin,
      hoursText: r.hours ?? null,

      status: r.publication_status === 'published' ? 'PUBLISHED' : 'DRAFT',
      imageUrl: r.image && r.image.startsWith('http') ? r.image : null,
      internalNotes: r.notes ?? null,
      tags,
    };
  });

  const usage = new Map<string, number>();
  for (const rest of restaurants) {
    for (const t of rest.tags) {
      const key = `${t.type}::${t.label}`;
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }

  let rareDropped = 0;
  for (const rest of restaurants) {
    rest.tags = rest.tags.filter((t) => {
      if (KEEP_SINGLETONS.has(t.type)) return true;
      const uses = usage.get(`${t.type}::${t.label}`) ?? 0;
      if (uses >= MIN_TAG_USES) return true;
      rareDropped++;
      return false;
    });
  }

  const tagCounts = new Map<string, Set<string>>();
  for (const rest of restaurants) {
    for (const t of rest.tags) {
      if (!tagCounts.has(t.type)) tagCounts.set(t.type, new Set());
      tagCounts.get(t.type)!.add(t.label);
    }
  }

  console.log('=== NORMALISED TAXONOMY ===');
  for (const [type, set] of [...tagCounts.entries()].sort()) {
    console.log(
      `  ${type.padEnd(10)} ${String(set.size).padStart(3)} distinct`,
    );
  }
  console.log(
    `\n  rejected as prose        ${dropped.length}` +
      `\n  dropped as too rare (<${MIN_TAG_USES})  ${rareDropped}`,
  );

  const areas = new Set(restaurants.map((r) => r.neighborhood).filter(Boolean));
  console.log(`\n  neighborhoods  ${areas.size} distinct (from 93 raw)`);
  console.log(
    `  municipalities ${new Set(restaurants.map((r) => r.municipality)).size}`,
  );
  console.log(
    `\n  published ${restaurants.filter((r) => r.status === 'PUBLISHED').length}` +
      `  draft ${restaurants.filter((r) => r.status === 'DRAFT').length}`,
  );
  console.log(
    `  with image     ${restaurants.filter((r) => r.imageUrl).length}`,
  );
  console.log(
    `  with hours     ${restaurants.filter((r) => r.hoursText).length}`,
  );
  console.log(
    `  unique slugs   ${new Set(restaurants.map((r) => r.slug)).size}`,
  );

  if (warnings.length) {
    console.log(`\n=== WARNINGS (${warnings.length}) ===`);
    warnings.slice(0, 10).forEach((w) => console.log(`  ${w}`));
  }

  const outDir = path.join(process.cwd(), 'prisma', 'seed-data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'restaurants.json');
  fs.writeFileSync(outFile, JSON.stringify(restaurants, null, 2));
  console.log(
    `\nWrote ${restaurants.length} restaurants to prisma/seed-data/restaurants.json ` +
      `(${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`,
  );
}

main();
