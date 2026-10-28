import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ADMIN_EMAIL, adminLogin, adminReq, call, freshDb, loginUser, req } from "./helpers";
import { POST as login } from "@/app/api/admin/auth/login/route";
import { POST as logout } from "@/app/api/admin/auth/logout/route";
import { GET as meAdmin } from "@/app/api/admin/auth/me/route";
import { GET as dashboard } from "@/app/api/admin/dashboard/route";
import { GET as users } from "@/app/api/admin/users/route";
import { GET as auditList } from "@/app/api/admin/audit/route";
import { GET as settingsGet, PUT as settingsPut } from "@/app/api/admin/settings/route";
import { POST as contentPost, GET as contentGet } from "@/app/api/admin/content/[kind]/route";
import { PUT as contentPut } from "@/app/api/admin/content/[kind]/[id]/route";
import { GET as plansGet } from "@/app/api/admin/plans/route";
import { PUT as planPut } from "@/app/api/admin/plans/[id]/route";
import { POST as grant } from "@/app/api/admin/memberships/route";
import { GET as homeFeed } from "@/app/api/v1/home/route";
import { GET as publicConfig } from "@/app/api/v1/config/route";
import { GET as getMembership } from "@/app/api/v1/membership/route";
import { GET as quotePkgs } from "@/app/api/v1/quotes/packages/route";
import { GET as publicPlans } from "@/app/api/v1/plans/route";
import { adminUsers } from "@/db/schema";
import { hashPassword } from "@/server/crypto";
import type { Db } from "@/db";

let db: Db;
beforeAll(async () => {
  db = await freshDb();
});

describe("admin auth", () => {
  it("rejects wrong password and unknown email with the same message", async () => {
    const a = await call(login, req("POST", "/x", { body: { email: ADMIN_EMAIL, password: "wrong-wrong-wrong" }, headers: { "x-real-ip": "7.7.7.1" } }));
    const b = await call(login, req("POST", "/x", { body: { email: "nobody@example.test", password: "wrong-wrong-wrong" }, headers: { "x-real-ip": "7.7.7.2" } }));
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.data.error.message).toBe(b.data.error.message);
  });

  it("locks login attempts after repeated failures", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await call(login, req("POST", "/x", { body: { email: "brute@example.test", password: "nope-nope-nope" }, headers: { "x-real-ip": "7.7.7.3" } }))).status);
    }
    expect(codes.at(-1)).toBe(429);
  });

  it("sets an HttpOnly SameSite cookie and returns the session", async () => {
    const r = await call(login, req("POST", "/x", { body: { email: ADMIN_EMAIL, password: "correct-horse-battery-1" } }));
    expect(r.status).toBe(200);
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/SameSite=Strict/);
  });

  it("requires cookie, and a CSRF header for writes", async () => {
    expect((await call(dashboard, req("GET", "/x"))).status).toBe(401);
    const { cookie } = await adminLogin();
    expect((await call(dashboard, adminReq("GET", "/x", cookie))).status).toBe(200);
    const noCsrf = await call(settingsPut, req("PUT", "/x", { body: { promo_text: "hi" }, headers: { cookie } }));
    expect(noCsrf.status).toBe(403);
    const cross = await call(settingsPut, req("PUT", "/x", { body: { promo_text: "hi" }, headers: { cookie, "x-admin-csrf": "1", origin: "https://evil.example", host: "localhost" } }));
    expect(cross.status).toBe(403);
  });

  it("a user access token is not an admin session", async () => {
    const s = await loginUser("+917999900001");
    const r = await call(dashboard, req("GET", "/x", { token: s.accessToken, headers: { cookie: `cctv_admin=${s.accessToken}` } }));
    expect(r.status).toBe(401);
  });

  it("logout invalidates the old cookie", async () => {
    const { cookie } = await adminLogin();
    expect((await call(logout, adminReq("POST", "/x", cookie))).status).toBe(200);
    expect((await call(dashboard, adminReq("GET", "/x", cookie))).status).toBe(401);
  });

  it("disabled admins are locked out immediately", async () => {
    const { cookie } = await adminLogin();
    await db.update(adminUsers).set({ disabled: true }).where(eq(adminUsers.email, ADMIN_EMAIL));
    expect((await call(dashboard, adminReq("GET", "/x", cookie))).status).toBe(401);
    await db.update(adminUsers).set({ disabled: false }).where(eq(adminUsers.email, ADMIN_EMAIL));
  });
});

describe("admin permissions", () => {
  async function roleCookie(role: string) {
    const email = `${role}@example.test`;
    await db.insert(adminUsers).values({ email, passwordHash: await hashPassword("role-password-123"), roleName: role }).onConflictDoNothing();
    const r = await call(login, req("POST", "/x", { body: { email, password: "role-password-123" }, headers: { "x-real-ip": `8.8.8.${role.length}` } }));
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  }

  it("viewer: dashboard yes, users/audit/settings no", async () => {
    const c = await roleCookie("viewer");
    expect((await call(dashboard, adminReq("GET", "/x", c))).status).toBe(200);
    expect((await call(users, adminReq("GET", "/x", c))).status).toBe(403);
    expect((await call(auditList, adminReq("GET", "/x", c))).status).toBe(403);
    expect((await call(settingsGet, adminReq("GET", "/x", c))).status).toBe(403);
  });

  it("support: can view users but not export or write", async () => {
    const c = await roleCookie("support");
    expect((await call(users, adminReq("GET", "/x", c))).status).toBe(200);
    expect((await call(users, adminReq("GET", "/api/admin/users?format=csv", c))).status).toBe(403);
    expect((await call(contentPost, adminReq("POST", "/x", c, { title: "t", body: "b" }), { kind: "notifications" })).status).toBe(403);
  });

  it("manager: manages content and non-payment settings, not plans, grants or payment settings", async () => {
    const c = await roleCookie("manager");
    expect((await call(settingsPut, adminReq("PUT", "/x", c, { promo_text: "Hello" }))).status).toBe(200);
    const pay = await call(settingsPut, adminReq("PUT", "/x", c, { upi_payee_name: "Someone" }));
    expect(pay.status).toBe(403);
    const plans = (await call(plansGet, adminReq("GET", "/x", c))).data.plans;
    expect((await call(planPut, adminReq("PUT", "/x", c, { pricePaise: 100 }), { id: plans[0].id })).status).toBe(403);
    expect((await call(grant, adminReq("POST", "/x", c, { userId: crypto.randomUUID(), planCode: "limited", reason: "because reasons" }))).status).toBe(403);
    expect((await call(auditList, adminReq("GET", "/x", c))).status).toBe(403);
  });
});

describe("settings, content, plans, memberships (owner)", () => {
  it("settings: allowlist and validation", async () => {
    const { cookie } = await adminLogin();
    const unknown = await call(settingsPut, adminReq("PUT", "/x", cookie, { JWT_SECRET: "x" }));
    expect(unknown.status).toBe(400);
    const badUrl = await call(settingsPut, adminReq("PUT", "/x", cookie, { amazon_url: "javascript:alert(1)" }));
    expect(badUrl.status).toBe(400);
    const badPhone = await call(settingsPut, adminReq("PUT", "/x", cookie, { whatsapp_number: "abc" }));
    expect(badPhone.status).toBe(400);
  });

  it("public config never exposes private settings", async () => {
    const { cookie } = await adminLogin();
    await call(settingsPut, adminReq("PUT", "/x", cookie, { whatsapp_number: "+917797493140", promo_text: "Welcome" }));
    const cfg = await call(publicConfig, req("GET", "/x"));
    const s = JSON.stringify(cfg.data);
    expect(s).toContain("Welcome");
    expect(s).not.toContain("7797493140");
    expect(s).not.toContain("upi_");
  });

  it("banner: draft is hidden, published is visible, unpublished is hidden again", async () => {
    const { cookie } = await adminLogin();
    const created = await call(contentPost, adminReq("POST", "/x", cookie, { imageUrl: "https://example.com/b.png", title: "Launch", status: "draft" }), { kind: "banners" });
    expect(created.status).toBe(201);
    const id = created.data.item.id;
    const viewer = await loginUser("+917999900005");
    const visible = async () => JSON.stringify((await call(homeFeed, req("GET", "/x", { token: viewer.accessToken }))).data).includes("Launch");
    expect(await visible()).toBe(false);
    await call(contentPut, adminReq("PUT", "/x", cookie, { status: "published" }), { kind: "banners", id });
    expect(await visible()).toBe(true);
    await call(contentPut, adminReq("PUT", "/x", cookie, { status: "unpublished" }), { kind: "banners", id });
    expect(await visible()).toBe(false);
  });

  it("books: admin adds a book with any buy site; draft is hidden, published shows in the home feed", async () => {
    const { cookie } = await adminLogin();
    const bad = await call(contentPost, adminReq("POST", "/x", cookie, { title: "X", buyUrl: "javascript:alert(1)" }), { kind: "books" });
    expect(bad.status).toBe(400);
    const created = await call(contentPost, adminReq("POST", "/x", cookie, { title: "Second Book Title", author: "A. Writer", buyUrl: "https://shop.example.org/book-2", buttonText: "Buy on Example Shop", status: "draft" }), { kind: "books" });
    expect(created.status).toBe(201);
    const viewer = await loginUser("+917999900011");
    const feed = async () => (await call(homeFeed, req("GET", "/x", { token: viewer.accessToken }))).data;
    expect(JSON.stringify(await feed())).not.toContain("Second Book Title");
    await call(contentPut, adminReq("PUT", "/x", cookie, { status: "published", sortOrder: 5 }), { kind: "books", id: created.data.item.id });
    const f = await feed();
    const mine = f.books.find((b: any) => b.title === "Second Book Title");
    expect(mine.buyUrl).toBe("https://shop.example.org/book-2");
    expect(mine.buttonText).toBe("Buy on Example Shop");
    // The seeded default book is there too, and older apps still get a single `book`.
    expect(f.books.some((b: any) => b.title === "CCTV Secret & Entrepreneurship")).toBe(true);
    expect(f.book.amazonUrl).toContain("amazon.in");
  });

  it("quotes: admin builds a package with priced items; only published packages and active items reach the app", async () => {
    const { cookie } = await adminLogin();
    const viewer = await loginUser("+917999900012");
    const get = async () => (await call(quotePkgs, req("GET", "/x", { token: viewer.accessToken }))).data;
    expect(JSON.stringify(await get())).toContain("HD Camera Package"); // sample packages ship published with dummy prices
    const pkg = await call(contentPost, adminReq("POST", "/x", cookie, { name: "Test Package", status: "published" }), { kind: "quote_packages" });
    expect(pkg.status).toBe(201);
    const pid = pkg.data.item.id;
    const bad = await call(contentPost, adminReq("POST", "/x", cookie, { packageId: pid, name: "Neg", unitPricePaise: -5 }), { kind: "quote_items" });
    expect(bad.status).toBe(400);
    await call(contentPost, adminReq("POST", "/x", cookie, { packageId: pid, name: "IP Camera", unitPricePaise: 250000, sortOrder: 0 }), { kind: "quote_items" });
    await call(contentPost, adminReq("POST", "/x", cookie, { packageId: pid, name: "Hidden Item", unitPricePaise: 100, isActive: false }), { kind: "quote_items" });
    const d = await get();
    const mine = d.items.find((p: any) => p.id === pid);
    expect(mine.items.map((i: any) => i.name)).toEqual(["IP Camera"]);
    expect(mine.items[0]).toMatchObject({ unitPricePaise: 250000, defaultQty: 1, unit: "pcs" });
    expect(d.orderWhatsapp).toBe("+917797493140");
    expect((await call(quotePkgs, req("GET", "/x"))).status).toBe(401);
  });

  it("partial update keeps fields that were not sent", async () => {
    const { cookie } = await adminLogin();
    const c = await call(contentPost, adminReq("POST", "/x", cookie, { imageUrl: "https://example.com/k.png", title: "Keep", status: "published", sortOrder: 7 }), { kind: "banners" });
    const u = await call(contentPut, adminReq("PUT", "/x", cookie, { title: "Keep 2" }), { kind: "banners", id: c.data.item.id });
    expect(u.data.item.status).toBe("published");
    expect(u.data.item.sortOrder).toBe(7);
  });

  it("rejects unsafe URLs and unknown fields in content", async () => {
    const { cookie } = await adminLogin();
    const a = await call(contentPost, adminReq("POST", "/x", cookie, { imageUrl: "javascript:x", title: "T" }), { kind: "banners" });
    expect(a.status).toBe(400);
    const b = await call(contentPost, adminReq("POST", "/x", cookie, { videoUrl: "https://e.com/v", title: "T", id: "x" }), { kind: "videos" });
    expect(b.status).toBe(400);
    const c = await call(contentGet, adminReq("GET", "/x", cookie), { kind: "../etc" });
    expect(c.status).toBe(404);
  });

  it("paid video content is locked for non-members in the feed", async () => {
    const { cookie } = await adminLogin();
    await call(contentPost, adminReq("POST", "/x", cookie, { videoUrl: "https://example.com/secret-video", title: "Paid lesson", isFree: false, status: "published" }), { kind: "videos" });
    const s = await loginUser("+917999900002");
    const feed = JSON.stringify((await call(homeFeed, req("GET", "/x", { token: s.accessToken }))).data);
    expect(feed).toContain("Paid lesson");
    expect(feed).not.toContain("secret-video");
  });

  it("plan edits are validated and audited; lifetime has no duration", async () => {
    const { cookie } = await adminLogin();
    const plans = (await call(plansGet, adminReq("GET", "/x", cookie))).data.plans;
    const lifetime = plans.find((p: any) => p.code === "lifetime");
    expect((await call(planPut, adminReq("PUT", "/x", cookie, { pricePaise: -5 }), { id: lifetime.id })).status).toBe(400);
    expect((await call(planPut, adminReq("PUT", "/x", cookie, { durationDays: 10 }), { id: lifetime.id })).status).toBe(400);
    const limited = plans.find((p: any) => p.code === "limited");
    expect((await call(planPut, adminReq("PUT", "/x", cookie, { name: "Limited Support" }), { id: limited.id })).status).toBe(200);
    const pub = await call(publicPlans, req("GET", "/x"));
    expect(JSON.stringify(pub.data)).toContain("Limited Support");
  });

  it("manual grant requires a reason and is audited; users list masks nothing sensitive in CSV formula", async () => {
    const { cookie } = await adminLogin();
    const s = await loginUser("+917999900003");
    const short = await call(grant, adminReq("POST", "/x", cookie, { userId: s.user.id, planCode: "limited", reason: "x" }));
    expect(short.status).toBe(400);
    const ok = await call(grant, adminReq("POST", "/x", cookie, { userId: s.user.id, planCode: "lifetime", reason: "Compensation for outage" }));
    expect(ok.status).toBe(201);
    expect((await call(getMembership, req("GET", "/x", { token: s.accessToken }))).data.membership?.isLifetime).toBe(true);
    const logs = await call(auditList, adminReq("GET", "/api/admin/audit?q=membership", cookie));
    expect(JSON.stringify(logs.data)).toContain("Compensation");
  });

  it("audit log never stores secrets", async () => {
    const { cookie } = await adminLogin();
    const logs = await call(auditList, adminReq("GET", "/api/admin/audit?limit=100", cookie));
    const s = JSON.stringify(logs.data);
    expect(s).not.toContain("correct-horse");
    expect(s).not.toMatch(/scrypt/i);
  });

  it("dashboard returns gross, refunds and net", async () => {
    const { cookie } = await adminLogin();
    const d = (await call(dashboard, adminReq("GET", "/x", cookie))).data;
    expect(d).toHaveProperty("grossPaise");
    expect(d.netPaise).toBe(d.grossPaise - d.refundedPaise);
  });

  it("users CSV neutralises formulas", async () => {
    const { cookie } = await adminLogin();
    const s = await loginUser("+917999900004");
    const { PUT } = await import("@/app/api/v1/me/route");
    await call(PUT, req("PUT", "/x", { token: s.accessToken, body: { fullName: "=HYPERLINK(\"http://evil\")", location: "Purulia WB", pinCode: "7231", category: "individual" } }));
    const csv = await call(users, adminReq("GET", "/api/admin/users?format=csv", cookie));
    expect(csv.status).toBe(200);
    expect(String(csv.data)).not.toMatch(/(^|,)"?=HYPERLINK/m);
  });
});
