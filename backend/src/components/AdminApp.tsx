"use client";

import React, { useCallback, useEffect, useState } from "react";

type Me = { email: string; role: string; permissions: string[] };
type Json = any;

async function api(path: string, method = "GET", body?: unknown): Promise<Json> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-admin-csrf": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: Json = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = data?.error?.issues?.[0] ? `${data.error.issues[0].path?.join(".")}: ${data.error.issues[0].message}` : "";
    throw new Error(`${data?.error?.message ?? "Request failed"}${detail ? ` (${detail})` : ""}`);
  }
  return data;
}

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-");

function useAction() {
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok = "Saved.") => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ t: ok });
      return true;
    } catch (e) {
      setMsg({ t: (e as Error).message, err: true });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const el = msg ? <div className={`msg${msg.err ? " err" : ""}`} role="status">{msg.t}</div> : null;
  return { run, busy, el };
}

export default function AdminApp() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    api("/auth/me").then((r) => setMe(r.admin)).catch(() => setMe(null));
  }, []);

  if (me === undefined) return <div className="login">Loading…</div>;
  if (!me) return <Login onDone={setMe} />;

  const can = (p: string) => me.permissions.includes(p);
  const tabs: [string, string, boolean][] = [
    ["dashboard", "Dashboard", can("dashboard.view")],
    ["users", "Users", can("users.view")],
    ["payments", "Payments", can("payments.view")],
    ["memberships", "Memberships", can("memberships.view")],
    ["plans", "Plans", can("plans.manage")],
    ["banners", "Banners", can("content.manage")],
    ["books", "Books", can("content.manage")],
    ["quotes", "GEN Quotes", can("content.manage")],
    ["videos", "Videos", can("content.manage")],
    ["resources", "PDFs & pages", can("content.manage")],
    ["notifications", "Notifications", can("notifications.manage")],
    ["settings", "Settings", can("settings.manage")],
    ["audit", "Audit log", can("audit.view")],
  ];

  return (
    <div className="shell">
      <nav className="side" aria-label="Admin navigation">
        <b>CCTV Admin</b>
        {tabs.filter((t) => t[2]).map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
        <button
          onClick={async () => {
            await api("/auth/logout", "POST").catch(() => {});
            setMe(null);
          }}
        >
          Sign out ({me.role})
        </button>
      </nav>
      <main className="main">
        {tab === "dashboard" && <Dashboard />}
        {tab === "users" && <Users can={can} />}
        {tab === "payments" && <Payments can={can} />}
        {tab === "memberships" && <Memberships can={can} />}
        {tab === "plans" && <Plans />}
        {tab === "banners" && <Content kind="banners" />}
        {tab === "books" && <Content kind="books" />}
        {tab === "quotes" && <Quotes />}
        {tab === "videos" && <Content kind="videos" />}
        {tab === "resources" && <Content kind="resources" />}
        {tab === "notifications" && <Content kind="notifications" />}
        {tab === "settings" && <Settings canPayment={can("payment_settings.manage")} />}
        {tab === "audit" && <Audit />}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: (m: Me) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const a = useAction();
  return (
    <form
      className="login card"
      onSubmit={async (e) => {
        e.preventDefault();
        await a.run(async () => {
          await api("/auth/login", "POST", { email, password });
          onDone((await api("/auth/me")).admin);
        }, "Signed in.");
      }}
    >
      <h1>Admin sign in</h1>
      <label htmlFor="em">Email</label>
      <input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="pw">Password</label>
      <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {a.el}
      <p><button disabled={a.busy}>Sign in</button></p>
    </form>
  );
}

function useLoad<T = Json>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    api(path).then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message));
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reload, [reload, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload };
}

function Dashboard() {
  const { data: d, error } = useLoad("/dashboard");
  if (error) return <div className="msg err">{error}</div>;
  if (!d) return <p>Loading…</p>;
  const items: [string, string | number][] = [
    ["Registered users", d.totalUsers], ["New (30 days)", d.newUsers30d], ["Successful payments", d.successfulPayments],
    ["Gross revenue", rupees(d.grossPaise)], ["Refunds", rupees(d.refundedPaise)], ["Net revenue", rupees(d.netPaise)],
    ["Active memberships", d.activeMemberships], ["Awaiting manual review", d.pendingManualReviews], ["Pending orders", d.pendingOrders],
  ];
  return (
    <>
      <h1>Dashboard</h1>
      <div className="grid">{items.map(([k, v]) => <div key={k} className="card stat"><small>{k}</small><b>{v}</b></div>)}</div>
    </>
  );
}

function Users({ can }: { can: (p: string) => boolean }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const qs = `?page=${page}&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}`;
  const { data, error, reload } = useLoad(`/users${qs}`);
  const a = useAction();
  return (
    <>
      <h1>Users</h1>
      <div className="row">
        <input style={{ maxWidth: 260 }} placeholder="Search name, mobile, location" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="deleted">Deleted</option>
        </select>
        {can("users.export") && <a href={`/api/admin/users?format=csv&q=${encodeURIComponent(q)}${status ? `&status=${status}` : ""}`}>Export CSV</a>}
      </div>
      {error && <div className="msg err">{error}</div>}
      {a.el}
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Mobile</th><th>Location</th><th>Email</th><th>Category</th><th>Status</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {data?.rows.map((u: Json) => (
              <tr key={u.id}>
                <td>{u.fullName ?? "-"}</td><td>{u.mobile}</td><td>{u.location ?? "-"}</td><td>{u.email ?? "-"}</td><td>{u.category ?? "-"}</td>
                <td><span className={`pill ${u.status}`}>{u.status}</span></td><td>{when(u.createdAt)}</td>
                <td>
                  {can("users.manage") && u.status !== "deleted" && (
                    <button className="ghost" disabled={a.busy} onClick={async () => { if (await a.run(() => api(`/users/${u.id}`, "PATCH", { status: u.status === "blocked" ? "active" : "blocked" }))) reload(); }}>
                      {u.status === "blocked" ? "Unblock" : "Block"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
    </>
  );
}

function Pager({ page, setPage, total, size = 25 }: { page: number; setPage: (n: number) => void; total: number; size?: number }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="row">
      <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages} ({total})</span>
      <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
    </div>
  );
}

function Payments({ can }: { can: (p: string) => boolean }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, reload } = useLoad(`/payments?page=${page}${status ? `&status=${status}` : ""}`);
  const a = useAction();
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const orderOf = (id: string) => data?.rows.find((r: Json) => r.orderId === id);
  return (
    <>
      <h1>Payments</h1>
      {error && <div className="msg err">{error}</div>}
      {a.el}
      {data?.pendingProofs?.length > 0 && can("payments.verify_manual") && (
        <div className="card">
          <h2>Manual UPI payments to verify</h2>
          <p style={{ color: "var(--muted)" }}>Check the UTR and amount in your PhonePe/bank statement first. Only approve if the money is actually received.</p>
          {data.pendingProofs.map((p: Json) => {
            const o = orderOf(p.orderId);
            return (
              <div key={p.id} className="card">
                <div><b>UTR {p.utr}</b> · submitted {when(p.createdAt)}</div>
                {o && <div>Order {o.orderRef} · {o.mobileMasked} · {o.planCode} · expected {rupees(o.amountPaise)}</div>}
                <div className="row">
                  <input style={{ maxWidth: 170 }} placeholder="Amount received (₹)" inputMode="decimal" value={amount[p.id] ?? ""} onChange={(e) => setAmount({ ...amount, [p.id]: e.target.value })} />
                  <input style={{ maxWidth: 260 }} placeholder="Note (e.g. matched statement)" value={note[p.id] ?? ""} onChange={(e) => setNote({ ...note, [p.id]: e.target.value })} />
                  <button className="ok" disabled={a.busy} onClick={async () => { if (await a.run(() => api(`/payments/proofs/${p.id}/approve`, "POST", { receivedAmountPaise: Math.round(Number(amount[p.id]) * 100), note: note[p.id] ?? "" }), "Approved. Membership activated.")) reload(); }}>Approve</button>
                  <button className="bad" disabled={a.busy} onClick={async () => { if (await a.run(() => api(`/payments/proofs/${p.id}/reject`, "POST", { note: note[p.id] ?? "" }), "Rejected.")) reload(); }}>Reject</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="row">
        <select style={{ maxWidth: 200 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {["pending", "awaiting_review", "paid", "failed", "cancelled", "expired"].map((s) => <option key={s}>{s}</option>)}
        </select>
        {can("payments.export") && <a href="/api/admin/payments?format=csv">Export CSV</a>}
      </div>
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>Order</th><th>Date</th><th>Mobile</th><th>Plan</th><th>Amount</th><th>Status</th><th>Provider</th><th>Txn</th><th /></tr></thead>
          <tbody>
            {data?.rows.map((r: Json) => (
              <tr key={r.orderId}>
                <td>{r.orderRef}</td><td>{when(r.createdAt)}</td><td>{r.mobileMasked}</td><td>{r.planCode}</td><td>{rupees(r.amountPaise)}</td>
                <td><span className={`pill ${r.status}`}>{r.status}</span> {r.txnStatus === "refunded" && <span className="pill refunded">refunded</span>}</td>
                <td>{r.provider}</td><td>{r.txnRef ?? "-"}</td>
                <td>
                  {can("payments.refund") && r.txnId && r.txnStatus === "success" && (
                    <button className="ghost" disabled={a.busy} onClick={async () => {
                      const reason = window.prompt("Reason for refund (min 5 characters). Record the refund only after you have actually returned the money.");
                      if (reason && (await a.run(() => api(`/payments/transactions/${r.txnId}/refund`, "POST", { reason }), "Refund recorded; membership ended."))) reload();
                    }}>Record refund</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} setPage={setPage} total={data?.total ?? 0} />
    </>
  );
}

function Memberships({ can }: { can: (p: string) => boolean }) {
  const { data, error, reload } = useLoad("/memberships?limit=100");
  const a = useAction();
  const [g, setG] = useState({ userId: "", planCode: "limited", reason: "" });
  return (
    <>
      <h1>Memberships</h1>
      {error && <div className="msg err">{error}</div>}
      {a.el}
      {can("memberships.manage") && (
        <div className="card">
          <h2>Grant support manually</h2>
          <div className="row">
            <input style={{ maxWidth: 320 }} placeholder="User ID (from Users)" value={g.userId} onChange={(e) => setG({ ...g, userId: e.target.value })} />
            <select style={{ maxWidth: 140 }} value={g.planCode} onChange={(e) => setG({ ...g, planCode: e.target.value })}><option value="limited">Limited</option><option value="lifetime">Lifetime</option></select>
            <input style={{ maxWidth: 320 }} placeholder="Reason (required)" value={g.reason} onChange={(e) => setG({ ...g, reason: e.target.value })} />
            <button disabled={a.busy} onClick={async () => { if (await a.run(() => api("/memberships", "POST", g), "Membership granted.")) reload(); }}>Grant</button>
          </div>
        </div>
      )}
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Mobile</th><th>Plan</th><th>Status</th><th>Type</th><th>Starts</th><th>Ends</th><th /></tr></thead>
          <tbody>
            {data?.rows.map((m: Json) => (
              <tr key={m.id}>
                <td>{m.reference}</td><td>{m.mobileMasked}</td><td>{m.plan}</td><td><span className={`pill ${m.status}`}>{m.status}</span></td>
                <td>{m.grantType}{m.grantReason ? `: ${m.grantReason}` : ""}</td><td>{when(m.startsAt)}</td><td>{m.endsAt ? when(m.endsAt) : "Lifetime"}</td>
                <td>{can("memberships.manage") && m.status === "active" && (
                  <button className="ghost" disabled={a.busy} onClick={async () => {
                    const reason = window.prompt("Reason for revoking (min 5 characters)");
                    if (reason && (await a.run(() => api(`/memberships/${m.id}/revoke`, "POST", { reason }), "Revoked."))) reload();
                  }}>Revoke</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Plans() {
  const { data, error, reload } = useLoad("/plans");
  const a = useAction();
  const [edit, setEdit] = useState<Record<string, Json>>({});
  return (
    <>
      <h1>Support plans</h1>
      <p style={{ color: "var(--muted)" }}>Price changes apply to new orders only. Existing orders keep the price they were created with.</p>
      {error && <div className="msg err">{error}</div>}
      {a.el}
      {data?.plans.map((p: Json) => {
        const v = { name: p.name, price: p.pricePaise / 100, benefits: p.benefits.join("\n"), terms: p.terms, isActive: p.isActive, durationDays: p.durationDays, ...edit[p.id] };
        const set = (k: string, val: unknown) => setEdit({ ...edit, [p.id]: { ...edit[p.id], [k]: val } });
        return (
          <div className="card" key={p.id}>
            <h2>{p.code} {p.isLifetime ? "(lifetime)" : ""}</h2>
            <label>Name</label><input value={v.name} onChange={(e) => set("name", e.target.value)} />
            <label>Price (₹)</label><input type="number" min="1" value={v.price} onChange={(e) => set("price", e.target.value)} />
            {!p.isLifetime && (<><label>Duration (days)</label><input type="number" min="1" value={v.durationDays ?? ""} onChange={(e) => set("durationDays", e.target.value)} /></>)}
            <label>Benefits (one per line)</label><textarea value={v.benefits} onChange={(e) => set("benefits", e.target.value)} />
            <label>Terms</label><textarea value={v.terms} onChange={(e) => set("terms", e.target.value)} />
            <label><input style={{ width: "auto" }} type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Available for purchase</label>
            <p><button disabled={a.busy} onClick={async () => {
              const body: Json = { name: v.name, pricePaise: Math.round(Number(v.price) * 100), benefits: String(v.benefits).split("\n").map((s) => s.trim()).filter(Boolean), terms: v.terms, isActive: v.isActive };
              if (!p.isLifetime) body.durationDays = Number(v.durationDays);
              if (await a.run(() => api(`/plans/${p.id}`, "PUT", body))) { setEdit({ ...edit, [p.id]: undefined }); reload(); }
            }}>Save plan</button></p>
          </div>
        );
      })}
    </>
  );
}

type Field = { key: string; label: string; type?: "text" | "textarea" | "number" | "bool" | "select" | "datetime" | "image" | "pdf"; options?: string[]; required?: boolean };
const STATUS = ["draft", "published", "unpublished"];
const KINDS: Record<string, { title: string; fields: Field[]; summary: (i: Json) => string }> = {
  banners: {
    title: "Banners",
    summary: (i) => i.title,
    fields: [
      { key: "title", label: "Title", required: true }, { key: "description", label: "Description", type: "textarea" },
      { key: "imageUrl", label: "Image", type: "image", required: true }, { key: "buttonText", label: "Button text" }, { key: "destinationUrl", label: "Button link (https)" },
      { key: "status", label: "Status", type: "select", options: STATUS }, { key: "sortOrder", label: "Order", type: "number" },
      { key: "startsAt", label: "Show from", type: "datetime" }, { key: "endsAt", label: "Show until", type: "datetime" },
    ],
  },
  books: {
    title: "Books",
    summary: (i) => `${i.title}${i.author ? " by " + i.author : ""}`,
    fields: [
      { key: "title", label: "Book title", required: true }, { key: "author", label: "Author" },
      { key: "description", label: "Short description (optional)", type: "textarea" },
      { key: "coverUrl", label: "Cover image", type: "image" },
      { key: "buyUrl", label: "Buy link (any website, https)", required: true }, { key: "buttonText", label: "Button text (e.g. Buy on Amazon)", required: true },
      { key: "status", label: "Status", type: "select", options: STATUS }, { key: "sortOrder", label: "Order (0 = first)", type: "number" },
    ],
  },
  videos: {
    title: "Videos",
    summary: (i) => `${i.title} ${i.isFree ? "(free)" : "(members)"}`,
    fields: [
      { key: "title", label: "Title", required: true }, { key: "description", label: "Description", type: "textarea" },
      { key: "videoUrl", label: "Video link (https, e.g. YouTube)", required: true }, { key: "thumbnailUrl", label: "Thumbnail", type: "image" },
      { key: "isFree", label: "Free for everyone", type: "bool" }, { key: "status", label: "Status", type: "select", options: STATUS }, { key: "sortOrder", label: "Order", type: "number" },
    ],
  },
  resources: {
    title: "PDFs & pages",
    summary: (i) => `${i.title} [${i.type}] ${i.isFree ? "(free)" : "(members)"}`,
    fields: [
      { key: "type", label: "Type", type: "select", options: ["pdf", "page"] }, { key: "title", label: "Title", required: true },
      { key: "summary", label: "Short summary", type: "textarea" }, { key: "fileUrl", label: "PDF file (for type pdf)", type: "pdf" },
      { key: "body", label: "Page text (for type page)", type: "textarea" }, { key: "isFree", label: "Free for everyone", type: "bool" },
      { key: "status", label: "Status", type: "select", options: STATUS }, { key: "sortOrder", label: "Order", type: "number" },
    ],
  },
  notifications: {
    title: "Notifications",
    summary: (i) => i.title,
    fields: [
      { key: "title", label: "Title", required: true }, { key: "body", label: "Message", type: "textarea", required: true },
      { key: "type", label: "Type", type: "select", options: ["announcement", "video", "pdf", "content", "offer"] },
      { key: "status", label: "Status", type: "select", options: ["draft", "published", "inactive"] },
    ],
  },
};

function Content({ kind }: { kind: string }) {
  const spec = KINDS[kind];
  const { data, error, reload } = useLoad(`/content/${kind}`, [kind]);
  const a = useAction();
  const [form, setForm] = useState<Json | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const blank = () => {
    const f: Json = {};
    for (const x of spec.fields) f[x.key] = x.type === "bool" ? true : x.type === "number" ? 0 : x.type === "select" ? x.options![0] : "";
    return f;
  };
  const upload = async (file: File, k: "image" | "pdf") => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/uploads?kind=${k}`, { method: "POST", body: fd, headers: { "x-admin-csrf": "1" }, credentials: "same-origin" });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message ?? "Upload failed");
    return j.url as string;
  };
  const clean = (f: Json) => {
    const out: Json = {};
    for (const x of spec.fields) {
      let v = f[x.key];
      if (x.type === "number") v = Number(v) || 0;
      else if (x.type === "datetime") v = v ? new Date(v).toISOString() : null;
      else if (typeof v === "string" && v === "" && !x.required) v = x.key === "description" || x.key === "summary" ? "" : null;
      out[x.key] = v;
    }
    return out;
  };

  if (form) {
    return (
      <>
        <h1>{editing ? "Edit" : "New"} · {spec.title}</h1>
        {a.el}
        <div className="card">
          {spec.fields.map((x) => (
            <div key={x.key}>
              <label>{x.label}{x.required ? " *" : ""}</label>
              {x.type === "textarea" ? <textarea value={form[x.key] ?? ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
                : x.type === "select" ? <select value={form[x.key]} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })}>{x.options!.map((o) => <option key={o}>{o}</option>)}</select>
                : x.type === "bool" ? <input style={{ width: "auto" }} type="checkbox" checked={!!form[x.key]} onChange={(e) => setForm({ ...form, [x.key]: e.target.checked })} />
                : x.type === "number" ? <input type="number" value={form[x.key]} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
                : x.type === "datetime" ? <input type="datetime-local" value={form[x.key] ? String(form[x.key]).slice(0, 16) : ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
                : x.type === "image" || x.type === "pdf" ? (
                  <div className="row">
                    <input value={form[x.key] ?? ""} placeholder="https://… or upload" onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />
                    <input type="file" accept={x.type === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp"} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) await a.run(async () => setForm({ ...form, [x.key]: await upload(file, x.type as "image" | "pdf") }), "Uploaded.");
                    }} />
                    {x.type === "image" && form[x.key] && <img src={form[x.key]} alt="" style={{ height: 60, borderRadius: 6 }} />}
                  </div>
                ) : <input value={form[x.key] ?? ""} onChange={(e) => setForm({ ...form, [x.key]: e.target.value })} />}
            </div>
          ))}
          <p className="row">
            <button disabled={a.busy} onClick={async () => {
              if (await a.run(() => editing ? api(`/content/${kind}/${editing}`, "PUT", clean(form)) : api(`/content/${kind}`, "POST", clean(form)))) { setForm(null); setEditing(null); reload(); }
            }}>Save</button>
            <button className="ghost" onClick={() => { setForm(null); setEditing(null); }}>Cancel</button>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>{spec.title}</h1>
      <p><button onClick={() => { setForm(blank()); setEditing(null); }}>Add new</button></p>
      {error && <div className="msg err">{error}</div>}
      {a.el}
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>Item</th><th>Status</th><th>Created</th><th /></tr></thead>
          <tbody>
            {data?.items.map((i: Json) => (
              <tr key={i.id}>
                <td>{spec.summary(i)}</td><td><span className={`pill ${i.status}`}>{i.status}</span></td><td>{when(i.createdAt)}</td>
                <td className="row">
                  <button className="ghost" onClick={() => { const f: Json = {}; for (const x of spec.fields) f[x.key] = i[x.key] ?? (x.type === "bool" ? false : ""); setForm(f); setEditing(i.id); }}>Edit</button>
                  {kind !== "notifications" && i.status === "published" && <button className="ghost" onClick={async () => { if (await a.run(() => api(`/content/${kind}/${i.id}`, "PUT", { status: "unpublished" }), "Unpublished.")) reload(); }}>Unpublish</button>}
                  <button className="ghost" onClick={async () => { if (window.confirm("Delete this item?") && (await a.run(() => api(`/content/${kind}/${i.id}`, "DELETE"), "Deleted."))) reload(); }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Quotes() {
  const pk = useLoad("/content/quote_packages");
  const it = useLoad("/content/quote_items");
  const vr = useLoad("/content/quote_variants");
  const a = useAction();
  const [vOpen, setVOpen] = useState<string | null>(null);
  const [vf, setVf] = useState<Json>({ label: "", price: "" });
  const [vEd, setVEd] = useState<Record<string, Json>>({});
  const variants = (id: string): Json[] => (vr.data?.items ?? []).filter((v: Json) => v.itemId === id).sort((x: Json, y: Json) => x.sortOrder - y.sortOrder);
  const [open, setOpen] = useState<string | null>(null);
  const [pf, setPf] = useState<Json | null>(null);
  const [nf, setNf] = useState<Json>({ name: "", price: "", qty: "1", unit: "pcs" });
  const [ed, setEd] = useState<Record<string, Json>>({});
  const reload = () => { pk.reload(); it.reload(); vr.reload(); };
  const items = (id: string): Json[] => (it.data?.items ?? []).filter((i: Json) => i.packageId === id).sort((x: Json, y: Json) => x.sortOrder - y.sortOrder);
  const total = (id: string) => items(id).filter((i) => i.isActive).reduce((t: number, i: Json) => t + i.unitPricePaise * i.defaultQty, 0);

  return (
    <>
      <h1>GEN · Quotation packages</h1>
      <p style={{ color: "var(--muted)" }}>Each published package appears in the app's GEN tab. Prices are per unit in ₹. Items with price 0 should be priced before publishing.</p>
      {(pk.error || it.error || vr.error) && <div className="msg err">{pk.error || it.error}</div>}
      {a.el}
      {pf ? (
        <div className="card">
          <label>Package name *</label><input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} />
          <label>Description</label><textarea value={pf.description} onChange={(e) => setPf({ ...pf, description: e.target.value })} />
          <label>Status</label><select value={pf.status} onChange={(e) => setPf({ ...pf, status: e.target.value })}>{STATUS.map((o) => <option key={o}>{o}</option>)}</select>
          <label>Order</label><input type="number" value={pf.sortOrder} onChange={(e) => setPf({ ...pf, sortOrder: e.target.value })} />
          <p className="row">
            <button disabled={a.busy} onClick={async () => {
              const body = { name: pf.name, description: pf.description, status: pf.status, sortOrder: Number(pf.sortOrder) || 0 };
              if (await a.run(() => pf.id ? api(`/content/quote_packages/${pf.id}`, "PUT", body) : api("/content/quote_packages", "POST", body), "Saved.")) { setPf(null); reload(); }
            }}>Save</button>
            <button className="ghost" onClick={() => setPf(null)}>Cancel</button>
          </p>
        </div>
      ) : <p><button onClick={() => setPf({ name: "", description: "", status: "draft", sortOrder: 0 })}>Add package</button></p>}

      {pk.data?.items.map((p: Json) => (
        <div className="card" key={p.id}>
          <div className="row">
            <b>{p.name}</b> <span className={`pill ${p.status}`}>{p.status}</span>
            <span style={{ color: "var(--muted)" }}>{items(p.id).length} items · default total ₹{(total(p.id) / 100).toLocaleString("en-IN")}</span>
            <button className="ghost" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Hide items" : "Items"}</button>
            <button className="ghost" onClick={() => setPf({ ...p })}>Edit</button>
            <button className="ghost" onClick={async () => { if (await a.run(() => api(`/content/quote_packages/${p.id}`, "PUT", { status: p.status === "published" ? "unpublished" : "published" }), "Updated.")) reload(); }}>{p.status === "published" ? "Unpublish" : "Publish"}</button>
            <button className="ghost" onClick={async () => { if (window.confirm("Delete this package and all its items?") && (await a.run(() => api(`/content/quote_packages/${p.id}`, "DELETE"), "Deleted."))) reload(); }}>Delete</button>
          </div>
          {open === p.id && (
            <div className="scroll">
              <table className="tbl">
                <thead><tr><th>Item</th><th>Image</th><th>Unit</th><th>Price ₹ (no variants)</th><th>Default qty</th><th>Active</th><th /></tr></thead>
                <tbody>
                  {items(p.id).map((i: Json) => {
                    const e = ed[i.id] ?? { name: i.name, unit: i.unit, imageUrl: i.imageUrl ?? "", price: String(i.unitPricePaise / 100), qty: String(i.defaultQty), isActive: i.isActive };
                    const set = (k: string, v: unknown) => setEd({ ...ed, [i.id]: { ...e, [k]: v } });
                    return (
                      <React.Fragment key={i.id}>
                      <tr>
                        <td><input value={e.name} onChange={(x) => set("name", x.target.value)} /></td>
                        <td>
                          {e.imageUrl && <img src={e.imageUrl} alt="" style={{ height: 36, borderRadius: 6, display: "block" }} />}
                          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (x) => {
                            const file = x.target.files?.[0];
                            if (!file) return;
                            await a.run(async () => {
                              const fd = new FormData(); fd.append("file", file);
                              const res = await fetch("/api/admin/uploads?kind=image", { method: "POST", body: fd, headers: { "x-admin-csrf": "1" }, credentials: "same-origin" });
                              const j = await res.json();
                              if (!res.ok) throw new Error(j?.error?.message ?? "Upload failed");
                              set("imageUrl", j.url);
                            }, "Image uploaded - press Save.");
                          }} />
                        </td>
                        <td><input style={{ width: 70 }} value={e.unit} onChange={(x) => set("unit", x.target.value)} /></td>
                        <td><input style={{ width: 100 }} type="number" min="0" step="0.01" value={e.price} onChange={(x) => set("price", x.target.value)} /></td>
                        <td><input style={{ width: 70 }} type="number" min="0" value={e.qty} onChange={(x) => set("qty", x.target.value)} /></td>
                        <td><input style={{ width: "auto" }} type="checkbox" checked={!!e.isActive} onChange={(x) => set("isActive", x.target.checked)} /></td>
                        <td className="row">
                          <button disabled={a.busy} onClick={async () => {
                            const body = { name: e.name, imageUrl: e.imageUrl || null, unit: e.unit, unitPricePaise: Math.round(Number(e.price) * 100), defaultQty: Number(e.qty) || 0, isActive: !!e.isActive };
                            if (await a.run(() => api(`/content/quote_items/${i.id}`, "PUT", body), "Saved.")) { setEd({ ...ed, [i.id]: undefined as never }); reload(); }
                          }}>Save</button>
                          <button className="ghost" onClick={() => setVOpen(vOpen === i.id ? null : i.id)}>Variants ({variants(i.id).length})</button>
                          <button className="ghost" onClick={async () => { if (window.confirm("Delete this item?") && (await a.run(() => api(`/content/quote_items/${i.id}`, "DELETE"), "Deleted."))) reload(); }}>Delete</button>
                        </td>
                      </tr>
                      {vOpen === i.id && (
                        <tr>
                          <td colSpan={7} style={{ background: "rgba(37,99,235,.08)" }}>
                            <b>Variants of {i.name}</b> <span style={{ color: "var(--muted)" }}>(e.g. 4 Channel, 1TB, Dome 2MP). If an item has variants, the customer must pick one and its price is used.</span>
                            {variants(i.id).map((v: Json) => {
                              const ve = vEd[v.id] ?? { label: v.label, price: String(v.unitPricePaise / 100), isActive: v.isActive };
                              const vset = (k: string, val: unknown) => setVEd({ ...vEd, [v.id]: { ...ve, [k]: val } });
                              return (
                                <div className="row" key={v.id} style={{ marginTop: 6 }}>
                                  <input value={ve.label} onChange={(x) => vset("label", x.target.value)} />
                                  <input style={{ width: 110 }} type="number" min="0" step="0.01" value={ve.price} onChange={(x) => vset("price", x.target.value)} />
                                  <label><input style={{ width: "auto" }} type="checkbox" checked={!!ve.isActive} onChange={(x) => vset("isActive", x.target.checked)} /> Active</label>
                                  <button disabled={a.busy} onClick={async () => {
                                    if (await a.run(() => api(`/content/quote_variants/${v.id}`, "PUT", { label: ve.label, unitPricePaise: Math.round(Number(ve.price) * 100), isActive: !!ve.isActive }), "Saved.")) { setVEd({ ...vEd, [v.id]: undefined as never }); reload(); }
                                  }}>Save</button>
                                  <button className="ghost" onClick={async () => { if (window.confirm("Delete this variant?") && (await a.run(() => api(`/content/quote_variants/${v.id}`, "DELETE"), "Deleted."))) reload(); }}>Delete</button>
                                </div>
                              );
                            })}
                            <div className="row" style={{ marginTop: 8 }}>
                              <input placeholder="New variant (e.g. 8 Channel)" value={vf.label} onChange={(x) => setVf({ ...vf, label: x.target.value })} />
                              <input style={{ width: 110 }} type="number" min="0" step="0.01" placeholder="Price ₹" value={vf.price} onChange={(x) => setVf({ ...vf, price: x.target.value })} />
                              <button disabled={a.busy || !vf.label.trim()} onClick={async () => {
                                const body = { itemId: i.id, label: vf.label, unitPricePaise: Math.round(Number(vf.price) * 100) || 0, sortOrder: variants(i.id).length };
                                if (await a.run(() => api("/content/quote_variants", "POST", body), "Variant added.")) { setVf({ label: "", price: "" }); reload(); }
                              }}>Add variant</button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                  <tr>
                    <td><input placeholder="New item name" value={nf.name} onChange={(x) => setNf({ ...nf, name: x.target.value })} /></td>
                    <td />
                    <td><input style={{ width: 70 }} value={nf.unit} onChange={(x) => setNf({ ...nf, unit: x.target.value })} /></td>
                    <td><input style={{ width: 100 }} type="number" min="0" step="0.01" placeholder="0" value={nf.price} onChange={(x) => setNf({ ...nf, price: x.target.value })} /></td>
                    <td><input style={{ width: 70 }} type="number" min="0" value={nf.qty} onChange={(x) => setNf({ ...nf, qty: x.target.value })} /></td>
                    <td />
                    <td><button disabled={a.busy || !nf.name.trim()} onClick={async () => {
                      const body = { packageId: p.id, name: nf.name, unit: nf.unit || "pcs", unitPricePaise: Math.round(Number(nf.price) * 100) || 0, defaultQty: Number(nf.qty) || 0, sortOrder: items(p.id).length };
                      if (await a.run(() => api("/content/quote_items", "POST", body), "Item added.")) { setNf({ name: "", price: "", qty: "1", unit: "pcs" }); reload(); }
                    }}>Add item</button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Settings({ canPayment }: { canPayment: boolean }) {
  const { data, error, reload } = useLoad("/settings");
  const a = useAction();
  const [edit, setEdit] = useState<Record<string, string>>({});
  const payKeys = ["upi_qr_image_url", "upi_payee_name"];
  return (
    <>
      <h1>App settings</h1>
      <p style={{ color: "var(--muted)" }}>Changes reach the app on its next refresh. Leave a field empty to clear it.</p>
      {error && <div className="msg err">{error}</div>}
      {a.el}
      <div className="card">
        {data?.settings.map((s: Json) => {
          const disabled = payKeys.includes(s.key) && !canPayment;
          const val = edit[s.key] ?? (s.value === null || s.value === undefined ? "" : String(s.value));
          const long = String(val).length > 80;
          return (
            <div key={s.key}>
              <label htmlFor={s.key}>{s.label} {s.public ? "" : "(private)"}</label>
              {long ? <textarea id={s.key} disabled={disabled} value={val} onChange={(e) => setEdit({ ...edit, [s.key]: e.target.value })} />
                : <input id={s.key} disabled={disabled} value={val} onChange={(e) => setEdit({ ...edit, [s.key]: e.target.value })} />}
            </div>
          );
        })}
        <p><button disabled={a.busy || !Object.keys(edit).length} onClick={async () => {
          const patch: Json = {};
          for (const [k, v] of Object.entries(edit)) patch[k] = v === "" ? null : v;
          if (await a.run(() => api("/settings", "PUT", patch))) { setEdit({}); reload(); }
        }}>Save settings</button></p>
      </div>
    </>
  );
}

function Audit() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(`/audit?page=${page}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <h1>Audit log</h1>
      <input style={{ maxWidth: 260 }} placeholder="Filter by action (e.g. payment)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {error && <div className="msg err">{error}</div>}
      <div className="card scroll">
        <table className="tbl">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {data?.rows.map((r: Json) => (
              <tr key={r.id}><td>{when(r.createdAt)}</td><td>{r.adminEmail ?? "-"}</td><td>{r.action}</td><td>{r.entity}</td><td><code style={{ fontSize: 12, wordBreak: "break-all" }}>{JSON.stringify(r.after)?.slice(0, 200)}</code></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row"><button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="ghost" disabled={(data?.rows.length ?? 0) < 25} onClick={() => setPage(page + 1)}>Next</button></div>
    </>
  );
}
