import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks --------------------------------------------------------------

vi.mock("@/lib/offlineCache", () => ({
  cacheTrades: vi.fn(async () => {}),
  readCachedTrades: vi.fn(async () => null),
  cacheStats: vi.fn(async () => {}),
  readCachedStats: vi.fn(async () => null),
  queueTrade: vi.fn(async () => ({ id: "queued-1", trade: {} })),
  getQueuedTrades: vi.fn(async () => []),
  markSynced: vi.fn(async () => {}),
}));

type Op = "select" | "insert" | "update";

interface FakeTable {
  rows: Record<string, unknown>[];
}

const tables: Record<string, FakeTable> = {
  trades: { rows: [] },
};

function resetTables() {
  tables.trades.rows = [];
}

function makeQuery(table: string, op: Op, payload?: Record<string, unknown>) {
  const state: {
    op: Op;
    payload?: Record<string, unknown>;
    filters: { col: string; val: unknown }[];
    isNullCols: string[];
    range?: [number, number];
  } = { op, payload, filters: [], isNullCols: [] };

  function exec(single: boolean) {
    const t = tables[table];
    if (!t) return Promise.resolve({ data: null, error: new Error("no table") });

    if (state.op === "insert") {
      const row = { id: `t-${t.rows.length + 1}`, deleted_at: null, ...state.payload } as Record<
        string,
        unknown
      >;
      t.rows.push(row);
      return Promise.resolve({ data: single ? row : [row], error: null });
    }

    if (state.op === "update") {
      const matches = t.rows.filter((r) =>
        state.filters.every((f) => r[f.col] === f.val),
      );
      for (const r of matches) Object.assign(r, state.payload);
      const out = matches[0];
      return Promise.resolve({ data: single ? (out ?? null) : matches, error: null });
    }

    // select
    let result = t.rows.filter((r) => state.filters.every((f) => r[f.col] === f.val));
    for (const col of state.isNullCols) {
      result = result.filter((r) => r[col] == null);
    }
    if (state.range) {
      const [from, to] = state.range;
      result = result.slice(from, to + 1);
    }
    if (single) {
      return Promise.resolve({ data: result[0] ?? null, error: null });
    }
    return Promise.resolve({ data: result, error: null });
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      state.filters.push({ col, val });
      return builder;
    },
    is: (col: string, val: unknown) => {
      if (val === null) state.isNullCols.push(col);
      return builder;
    },
    order: () => builder,
    range: (from: number, to: number) => {
      state.range = [from, to];
      // becomes awaitable directly
      return exec(false);
    },
    single: () => exec(true),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      exec(false).then(resolve, reject),
  };
  return builder as unknown as Record<string, (...args: unknown[]) => unknown>;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => makeQuery(table, "select"),
      insert: (payload: Record<string, unknown>) => makeQuery(table, "insert", payload),
      update: (payload: Record<string, unknown>) => makeQuery(table, "update", payload),
    }),
  },
}));

// ---- tests --------------------------------------------------------------

describe("tradeService integration (CRUD round-trip)", () => {
  beforeEach(() => {
    resetTables();
  });

  it("creates, lists, updates, and soft-deletes a trade", async () => {
    const svc = await import("./tradeService");
    const userId = "user-1";

    // CREATE
    const created = await svc.createTrade({
      user_id: userId,
      date: "2026-06-01",
      instrument: "ES",
      direction: "Long",
      entry: 5500,
      stop: 5490,
      target: 5520,
      result: "Win",
      r_multiple: 2,
      pnl: 200,
    } as never);
    expect(created.error).toBeNull();
    expect(created.data?.id).toBeTruthy();
    const id = created.data!.id;

    // READ (list)
    const list = await svc.getTrades(userId, 50, 0);
    expect(list.error).toBeNull();
    expect(list.data).toHaveLength(1);
    expect(list.data?.[0].instrument).toBe("ES");

    // STATS
    const stats = await svc.getTradeStats(userId);
    expect(stats.error).toBeNull();
    expect(stats.data?.totalTrades).toBe(1);
    expect(stats.data?.wins).toBe(1);
    expect(stats.data?.totalPnl).toBe(200);
    expect(stats.data?.winRate).toBe(1);

    // UPDATE
    const upd = await svc.updateTrade(id, { pnl: 250, r_multiple: 2.5 } as never);
    expect(upd.error).toBeNull();
    expect(upd.data?.pnl).toBe(250);

    // SOFT DELETE
    const del = await svc.deleteTrade(id);
    expect(del.error).toBeNull();
    const after = await svc.getTrades(userId, 50, 0);
    // soft-delete should exclude it via .is("deleted_at", null) filter
    expect(after.data).toHaveLength(0);
  });
});