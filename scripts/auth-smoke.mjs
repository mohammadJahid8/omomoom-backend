const BASE = process.env.API_BASE ?? "http://localhost:5001/api/v1";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? "admin@omomoom.dev";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? "Password123!";

let pass = 0;
let fail = 0;

function check(label, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}${detail ? `  ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ""}`);
  }
}

const jar = new Map();

function remember(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
  return raw;
}

async function call(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(init.headers ?? {}),
    },
    redirect: "manual",
  });
  const setCookies = remember(res);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return {
    status: res.status,
    body,
    setCookies,
    location: res.headers.get("location"),
  };
}

async function main() {
  const stamp = Date.now();
  const email = `smoke-${stamp}@omomoom.test`;
  const renamed = `smoke-${stamp}`;

  console.log(`\nAuth smoke test against ${BASE}\n`);

  console.log("Sign up");
  const reg = await call("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "sup3rsecret!",
      name: "Ana Smoke Silva",
    }),
  });
  check("register returns 201", reg.status === 201, String(reg.status));
  check(
    "username generated from the name",
    /^ana-smoke-silva\d*$/.test(reg.body?.data?.username ?? ""),
    reg.body?.data?.username ?? "",
  );
  check(
    "no password hash in the response",
    !JSON.stringify(reg.body ?? {}).includes("passwordHash"),
  );

  const cookie = reg.setCookies.find((c) => c.startsWith("omomoom_session="));
  check("session cookie set", Boolean(cookie));
  check("cookie is HttpOnly", /HttpOnly/i.test(cookie ?? ""));
  check("cookie is SameSite=Lax", /SameSite=Lax/i.test(cookie ?? ""));
  check(
    "cookie value is opaque, not a JWT",
    !(jar.get("omomoom_session") ?? "x.y.z").includes("."),
  );

  console.log("\nSession");
  const me = await call("/auth/me");
  check(
    "/auth/me returns the signed-in user",
    me.status === 200 && me.body?.data?.email === email,
    `${me.status}`,
  );
  check("role defaults to USER", me.body?.data?.role === "USER", me.body?.data?.role ?? "");
  check(
    "ownedRestaurantIds present",
    Array.isArray(me.body?.data?.ownedRestaurantIds),
  );

  const probe = await call("/auth/session");
  check(
    "/auth/session returns the user without erroring",
    probe.status === 200 && probe.body?.data?.email === email,
    String(probe.status),
  );

  console.log("\nValidation");
  const dupe = await call("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "sup3rsecret!", name: "Someone" }),
  });
  check("duplicate email rejected", dupe.status === 409, String(dupe.status));

  const weak = await call("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: `weak-${stamp}@omomoom.test`,
      password: "short",
      name: "X",
    }),
  });
  check("short password rejected", weak.status === 400, String(weak.status));

  console.log("\nProfile");
  const patch = await call("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ username: renamed }),
  });
  check(
    "username can be changed",
    patch.status === 200 && patch.body?.data?.username === renamed,
    String(patch.status),
  );
  const clash = await call("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ username: "admin" }),
  });
  check("taken username rejected", clash.status === 409, String(clash.status));
  const malformed = await call("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ username: "Not Valid!" }),
  });
  check("malformed username rejected", malformed.status === 400, String(malformed.status));

  console.log("\nSign out");
  const out = await call("/auth/logout", { method: "POST" });
  check("logout returns 200", out.status === 200, String(out.status));
  const dead = await call("/auth/me");
  check("session revoked immediately", dead.status === 401, String(dead.status));
  const empty = await call("/auth/session");
  check(
    "/auth/session reports nobody, without a 401",
    empty.status === 200 && empty.body?.data === null,
    String(empty.status),
  );

  console.log("\nSign in");
  const login = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "sup3rsecret!" }),
  });
  check("login returns 200", login.status === 200, String(login.status));
  const me2 = await call("/auth/me");
  check("new session works", me2.status === 200 && me2.body?.data?.email === email);

  console.log("\nRoles");
  jar.clear();
  const admin = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  check("seeded admin signs in", admin.status === 200, String(admin.status));
  check("admin carries the ADMIN role", admin.body?.data?.role === "ADMIN", admin.body?.data?.role ?? "");

  console.log("\nGoogle");
  const start = await call("/auth/google");
  const configured = start.status === 302;
  check(
    configured
      ? "google redirects to accounts.google.com"
      : "google reports 503 until credentials are set",
    configured
      ? (start.location ?? "").startsWith("https://accounts.google.com/")
      : start.status === 503,
    configured ? "302" : "503",
  );
  if (configured) {
    check(
      "CSRF state cookie issued",
      start.setCookies.some((c) => c.startsWith("omomoom_oauth_state=")),
    );
  }
  const forged = await call("/auth/google/callback?code=x&state=forged");
  check(
    "forged OAuth state refused",
    (forged.location ?? "").includes("invalid_state"),
    forged.location ?? String(forged.status),
  );

  console.log("\nBrute force (throwaway account)");
  let lockedAt = 0;
  for (let attempt = 1; attempt <= 9; attempt += 1) {
    const bad = await fetch(BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    if (bad.status === 429 && lockedAt === 0) lockedAt = attempt;
  }
  check("account locks after 8 failures", lockedAt === 9, `locked on attempt ${lockedAt}`);

  jar.clear();
  const locked = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "sup3rsecret!" }),
  });
  check(
    "lockout blocks the correct password too",
    locked.status === 429,
    String(locked.status),
  );

  console.log("\n" + "=".repeat(40));
  console.log(`  ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nSuite could not run:", error.message);
  console.error("Is the API running?  npm run dev\n");
  process.exitCode = 1;
});
