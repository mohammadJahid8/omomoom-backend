const BASE = "http://localhost:5001/api/v1";

let pass = 0;
let fail = 0;

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function check(label, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ""}`);
  }
}

console.log("\n=== LIST: basics ===");
{
  const { status, json } = await get("/restaurants?limit=5");
  check("200", status === 200);
  check("only published counted", json.meta?.total === 430, `total=${json.meta?.total}`);
  check("returns 5", json.data?.restaurants?.length === 5);
  check("meta has totalPages", json.meta?.totalPages === 86, `totalPages=${json.meta?.totalPages}`);
  check("facets present by default", Object.keys(json.data?.facets ?? {}).length === 6);
  const r = json.data.restaurants[0];
  check("card has cuisine", typeof r.cuisine === "string" || r.cuisine === null);
  check("signatureDishes is an array", Array.isArray(r.signatureDishes));
  check("no internalNotes leaked", !("internalNotes" in r));
  check("no pendingChanges leaked", !("pendingChanges" in r));
  check("no externalRef leaked", !("externalRef" in r));
}

console.log("\n=== FILTER: OR within a group, AND across groups ===");
{
  const a = await get("/restaurants?cuisine=japanese&limit=1");
  const b = await get("/restaurants?cuisine=italian&limit=1");
  const both = await get("/restaurants?cuisine=japanese&cuisine=italian&limit=1");
  const j = a.json.meta.total, i = b.json.meta.total, u = both.json.meta.total;
  check("OR widens", u > j && u > i, `japanese=${j} italian=${i} union=${u}`);
  check("union <= sum (overlap possible)", u <= j + i);

  const narrowed = await get("/restaurants?cuisine=japanese&area=brickell&limit=1");
  check("AND narrows", narrowed.json.meta.total <= j, `japanese+brickell=${narrowed.json.meta.total}`);

  const comma = await get("/restaurants?cuisine=japanese,italian&limit=1");
  check("comma form equals repeat form", comma.json.meta.total === u, `comma=${comma.json.meta.total}`);
}

console.log("\n=== FACETS: drill-down semantics ===");
{
  const base = await get("/restaurants?limit=1");
  const withCuisine = await get("/restaurants?cuisine=japanese&limit=1");

  const italianBefore = base.json.data.facets.cuisine.find((f) => f.slug === "italian")?.count;
  const italianAfter = withCuisine.json.data.facets.cuisine.find((f) => f.slug === "italian")?.count;
  check(
    "own group excluded from its counts",
    italianAfter === italianBefore,
    `italian ${italianBefore} -> ${italianAfter} while japanese selected`,
  );

  const areaBefore = base.json.data.facets.area.find((f) => f.slug === "brickell")?.count;
  const areaAfter = withCuisine.json.data.facets.area.find((f) => f.slug === "brickell")?.count;
  check(
    "other groups DO narrow",
    areaAfter < areaBefore,
    `brickell ${areaBefore} -> ${areaAfter}`,
  );

  check("price always shows all 4 tiers", base.json.data.facets.price.length === 4);
  check("facet counts sum sanely", base.json.data.facets.cuisine.every((f) => f.count > 0));
}

console.log("\n=== SEARCH ===");
{
  const { json } = await get("/restaurants?q=omakase&limit=3");
  check("finds by dish", json.meta.total > 0, `total=${json.meta.total}`);
  const upper = await get("/restaurants?q=OMAKASE&limit=1");
  check("case insensitive", upper.json.meta.total === json.meta.total);
  const none = await get("/restaurants?q=zzzzzznotathing");
  check("no match returns 200 + empty", none.status === 200 && none.json.meta.total === 0);
  check("facets still returned when empty", Array.isArray(none.json.data.facets?.cuisine));
}

console.log("\n=== PAGINATION: stability ===");
{
  const p1 = await get("/restaurants?limit=10&page=1&facets=false");
  const p2 = await get("/restaurants?limit=10&page=2&facets=false");
  const ids1 = p1.json.data.restaurants.map((r) => r.id);
  const ids2 = p2.json.data.restaurants.map((r) => r.id);
  check("no overlap between pages", !ids1.some((id) => ids2.includes(id)));
  check("facets=false omits facets", json_undefined(p1.json.data.facets));
  const last = await get("/restaurants?limit=10&page=43&facets=false");
  check("last page has rows", last.json.data.restaurants.length > 0);
  const past = await get("/restaurants?limit=10&page=9999&facets=false");
  check("page past the end is 200 + empty", past.status === 200 && past.json.data.restaurants.length === 0);
}
function json_undefined(v) { return v === undefined; }

console.log("\n=== VALIDATION: bad input ===");
{
  const cases = [
    ["?page=0", "page must be positive"],
    ["?page=-1", "negative page"],
    ["?limit=999", "limit above max"],
    ["?limit=abc", "non-numeric limit"],
    ["?sortBy=; DROP TABLE restaurants", "sql-ish sortBy"],
    ["?sortBy=unknown", "unknown sortBy"],
    ["?price=CHEAP", "invalid price enum"],
    ["?michelin=FOUR_STARS", "invalid michelin enum"],
  ];
  for (const [qs, label] of cases) {
    const { status, json } = await get(`/restaurants${qs}`);
    check(`400 for ${label}`, status === 400, `got ${status}`);
    if (status === 400) {
      check(`  has errorDetails`, Array.isArray(json.errorDetails) && json.errorDetails.length > 0);
    }
  }
  const unknown = await get("/restaurants?bogusParam=1&limit=1");
  check("unknown param ignored, not an error", unknown.status === 200);
}

console.log("\n=== DETAIL ===");
{
  const list = await get("/restaurants?limit=1&facets=false");
  const slug = list.json.data.restaurants[0].slug;
  const { status, json } = await get(`/restaurants/${slug}`);
  check("200 for real slug", status === 200);
  check("has grouped tags", typeof json.data.tags === "object" && !Array.isArray(json.data.tags));
  check("has photos array", Array.isArray(json.data.photos));
  check("has city", typeof json.data.city?.name === "string");
  check("no internalNotes leaked", !("internalNotes" in json.data));

  const missing = await get("/restaurants/definitely-not-a-real-restaurant");
  check("404 for unknown slug", missing.status === 404, `got ${missing.status}`);
  const bad = await get("/restaurants/Not_A_Valid_Slug!");
  check("400 for malformed slug", bad.status === 400, `got ${bad.status}`);

  const related = await get(`/restaurants/${slug}/related`);
  check("related returns 200", related.status === 200);
  check("related excludes itself", !related.json.data.some((r) => r.slug === slug));
}

console.log("\n=== DRAFTS ARE INVISIBLE ===");
{
  const all = await get("/restaurants?limit=1&facets=false");
  check("total is 430 not 500", all.json.meta.total === 430, `total=${all.json.meta.total}`);
}

console.log("\n=== TAXONOMY ===");
{
  const tags = await get("/tags");
  check("grouped by type", typeof tags.json.data.CUISINE === "object");
  const cuisines = await get("/tags?type=CUISINE");
  check("flat list when type given", Array.isArray(cuisines.json.data));
  check("cuisines have counts", cuisines.json.data.every((t) => t.count > 0));
  const badType = await get("/tags?type=NONSENSE");
  check("400 for bad tag type", badType.status === 400, `got ${badType.status}`);

  const areas = await get("/neighborhoods");
  check("neighborhoods 200", areas.status === 200);
  check("all have restaurants", areas.json.data.every((a) => a.count > 0));
  const cities = await get("/cities");
  check("cities 200", cities.status === 200 && cities.json.data.length === 1);
}

console.log(`\n${"=".repeat(40)}`);
console.log(`  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
