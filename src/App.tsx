import { useCallback, useEffect, useState } from "react";

type Rec = { id: number; type: "income" | "expense"; amount: number; category: string; note: string; date: string };
type Stats = {
  income: number; expense: number; balance: number;
  categories: { type: string; category: string; total: number; count: number }[];
};

const yuan = (cents: number) => (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString("sv");
const emptyForm = () => ({ type: "expense" as Rec["type"], amount: "", category: "", note: "", date: today() });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "请求失败");
  return data as T;
}

export default function App() {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [records, setRecords] = useState<Rec[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([
        api<Rec[]>(`/api/records?month=${month}`),
        api<Stats>(`/api/stats?month=${month}`),
      ]);
      setRecords(r);
      setStats(s);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(editId ? `/api/records/${editId}` : "/api/records", {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      setForm({ ...emptyForm(), type: form.type });
      setEditId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("确定删除这条记录?")) return;
    try {
      await api(`/api/records/${id}`, { method: "DELETE" });
      if (editId === id) { setEditId(null); setForm(emptyForm()); }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function edit(r: Rec) {
    setEditId(r.id);
    setForm({ type: r.type, amount: String(r.amount / 100), category: r.category, note: r.note, date: r.date });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const expenseCats = stats?.categories.filter((c) => c.type === "expense") ?? [];

  return (
    <main>
      <h1>记账小工具</h1>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card">
        <div className="row between">
          <h2>月度统计</h2>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="选择月份" />
        </div>
        <div className="summary">
          <div><span>收入</span><b className="income">{yuan(stats?.income ?? 0)}</b></div>
          <div><span>支出</span><b className="expense">{yuan(stats?.expense ?? 0)}</b></div>
          <div><span>结余</span><b>{yuan(stats?.balance ?? 0)}</b></div>
        </div>
        {expenseCats.length > 0 && (
          <ul className="bars">
            {expenseCats.map((c) => (
              <li key={c.category}>
                <span>{c.category}({c.count})</span>
                <div className="bar"><i style={{ width: `${(c.total / (stats?.expense || 1)) * 100}%` }} /></div>
                <em>{yuan(c.total)}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{editId ? "修改记录" : "新增记录"}</h2>
        <form onSubmit={submit} className="form">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Rec["type"] })} aria-label="类型">
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
          <input type="number" step="0.01" min="0.01" required placeholder="金额" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label="金额" />
          <input required maxLength={30} placeholder="分类(如 餐饮)" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="分类" />
          <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="日期" />
          <input maxLength={200} placeholder="备注(可选)" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="备注" />
          <div className="row">
            <button type="submit" disabled={busy}>{editId ? "保存" : "添加"}</button>
            {editId && <button type="button" className="ghost" onClick={() => { setEditId(null); setForm(emptyForm()); }}>取消</button>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>{month} 明细({records.length})</h2>
        {records.length === 0 ? <p className="muted">本月暂无记录</p> : (
          <ul className="list">
            {records.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.category}</b> <small>{r.date}</small>
                  {r.note && <div className="muted">{r.note}</div>}
                </div>
                <div className="row">
                  <span className={r.type}>{r.type === "income" ? "+" : "-"}{yuan(r.amount)}</span>
                  <button className="ghost" onClick={() => edit(r)}>编辑</button>
                  <button className="ghost danger" onClick={() => remove(r.id)}>删除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
