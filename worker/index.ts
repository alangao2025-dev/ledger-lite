import { Hono } from "hono";

type Env = { Bindings: CloudflareBindings };

type Input = { type: string; amount: number; category: string; note: string; date: string };

function parse(body: unknown): Input | null {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return null;
  const type = b.type;
  const cents = Math.round(Number(b.amount) * 100);
  const category = typeof b.category === "string" ? b.category.trim() : "";
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
  const date = typeof b.date === "string" ? b.date : "";
  if (type !== "income" && type !== "expense") return null;
  if (!Number.isFinite(cents) || cents <= 0 || cents > 1e12) return null;
  if (!category || category.length > 30) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null;
  return { type, amount: cents, category, note, date };
}

const app = new Hono<Env>().basePath("/api");

app.get("/records", async (c) => {
  const month = c.req.query("month");
  if (month && !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "月份格式应为 YYYY-MM" }, 400);
  const stmt = month
    ? c.env.DB.prepare("SELECT * FROM records WHERE substr(date,1,7) = ? ORDER BY date DESC, id DESC").bind(month)
    : c.env.DB.prepare("SELECT * FROM records ORDER BY date DESC, id DESC LIMIT 500");
  const { results } = await stmt.all();
  return c.json(results);
});

app.post("/records", async (c) => {
  const r = parse(await c.req.json().catch(() => null));
  if (!r) return c.json({ error: "参数不合法" }, 400);
  const row = await c.env.DB.prepare(
    "INSERT INTO records (type, amount, category, note, date) VALUES (?, ?, ?, ?, ?) RETURNING *",
  ).bind(r.type, r.amount, r.category, r.note, r.date).first();
  return c.json(row, 201);
});

app.put("/records/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const r = parse(await c.req.json().catch(() => null));
  if (!Number.isInteger(id) || !r) return c.json({ error: "参数不合法" }, 400);
  const row = await c.env.DB.prepare(
    "UPDATE records SET type=?, amount=?, category=?, note=?, date=? WHERE id=? RETURNING *",
  ).bind(r.type, r.amount, r.category, r.note, r.date, id).first();
  return row ? c.json(row) : c.json({ error: "记录不存在" }, 404);
});

app.delete("/records/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "参数不合法" }, 400);
  const res = await c.env.DB.prepare("DELETE FROM records WHERE id = ?").bind(id).run();
  return res.meta.changes ? c.json({ ok: true }) : c.json({ error: "记录不存在" }, 404);
});

app.get("/stats", async (c) => {
  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "月份格式应为 YYYY-MM" }, 400);
  const { results } = await c.env.DB.prepare(
    "SELECT type, category, SUM(amount) AS total, COUNT(*) AS count FROM records WHERE substr(date,1,7) = ? GROUP BY type, category ORDER BY total DESC",
  ).bind(month).all<{ type: string; category: string; total: number; count: number }>();
  let income = 0, expense = 0;
  for (const r of results) r.type === "income" ? (income += r.total) : (expense += r.total);
  return c.json({ month, income, expense, balance: income - expense, categories: results });
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export default app;
