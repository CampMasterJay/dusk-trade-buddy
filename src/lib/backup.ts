import { supabase } from "@/integrations/supabase/client";

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  user: { id: string; email: string | null; settings: unknown; created_at: string | null };
  trades: unknown[];
  journals: unknown[];
  setupPlans: unknown[];
  chartAnalyses: unknown[];
  gamePlans: unknown[];
};

export type BackupCounts = {
  trades: number;
  journals: number;
  setupPlans: number;
  chartAnalyses: number;
  gamePlans: number;
};

const TABLES = [
  "trades",
  "trade_journals",
  "watch_setups",
  "chart_analyses",
  "daily_game_plans",
] as const;

async function fetchAll(table: string, userId: string): Promise<unknown[]> {
  const out: unknown[] = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table as any)
      .select("*")
      .eq("user_id", userId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function buildBackup(): Promise<BackupPayload> {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) throw new Error("Not signed in");
  const userId = u.user.id;

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const [trades, journals, setupPlans, chartAnalyses, gamePlans] = await Promise.all(
    TABLES.map((t) => fetchAll(t, userId)),
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: {
      id: userId,
      email: u.user.email ?? null,
      settings: settings ?? null,
      created_at: u.user.created_at ?? null,
    },
    trades,
    journals,
    setupPlans,
    chartAnalyses,
    gamePlans,
  };
}

export function countBackup(p: BackupPayload): BackupCounts {
  return {
    trades: p.trades?.length ?? 0,
    journals: p.journals?.length ?? 0,
    setupPlans: p.setupPlans?.length ?? 0,
    chartAnalyses: p.chartAnalyses?.length ?? 0,
    gamePlans: p.gamePlans?.length ?? 0,
  };
}

export function backupFilename(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `EdgeTrader_backup_${yyyy}-${mm}-${dd}.json`;
}

export async function downloadOrShareBackup(payload: BackupPayload): Promise<void> {
  const filename = backupFilename();
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  // Try native share with file (mobile)
  try {
    const nav = navigator as Navigator & {
      canShare?: (data?: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.share && nav.canShare) {
      const file = new File([blob], filename, { type: "application/json" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "EdgeTrader backup", text: filename });
        return;
      }
    }
  } catch {
    // fall through to download
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackup(text: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Backup is empty.");
  const obj = raw as Record<string, unknown>;
  const arr = (k: string): unknown[] => (Array.isArray(obj[k]) ? (obj[k] as unknown[]) : []);
  const payload: BackupPayload = {
    version: 1,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
    user: (obj.user as BackupPayload["user"]) ?? {
      id: "",
      email: null,
      settings: null,
      created_at: null,
    },
    trades: arr("trades"),
    journals: arr("journals"),
    setupPlans: arr("setupPlans"),
    chartAnalyses: arr("chartAnalyses"),
    gamePlans: arr("gamePlans"),
  };
  const counts = countBackup(payload);
  const total = counts.trades + counts.journals + counts.setupPlans + counts.chartAnalyses + counts.gamePlans;
  if (total === 0) throw new Error("Backup contains no records.");
  return payload;
}

/** Returns existing per-table record counts for the signed-in user. */
export async function getExistingCounts(): Promise<BackupCounts> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const userId = u.user.id;
  const tables = ["trades", "trade_journals", "watch_setups", "chart_analyses", "daily_game_plans"] as const;
  const results = await Promise.all(
    tables.map((t) =>
      supabase.from(t as any).select("id", { count: "exact", head: true }).eq("user_id", userId),
    ),
  );
  const [tr, jr, ws, ca, gp] = results.map((r) => r.count ?? 0);
  return { trades: tr, journals: jr, setupPlans: ws, chartAnalyses: ca, gamePlans: gp };
}

type ImportMode = "merge" | "replace";

/**
 * Imports a backup for the currently signed-in user.
 * - "merge": upserts rows (preserves existing ids; new rows added).
 * - "replace": deletes all existing rows in those tables first, then inserts.
 * user_id on every row is rewritten to the current user.
 */
export async function importBackup(
  payload: BackupPayload,
  mode: ImportMode = "merge",
): Promise<BackupCounts> {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) throw new Error("Not signed in");
  const userId = u.user.id;

  const groups: Array<{ table: string; rows: unknown[] }> = [
    { table: "trades", rows: payload.trades },
    { table: "trade_journals", rows: payload.journals },
    { table: "watch_setups", rows: payload.setupPlans },
    { table: "chart_analyses", rows: payload.chartAnalyses },
    { table: "daily_game_plans", rows: payload.gamePlans },
  ];

  if (mode === "replace") {
    for (const g of groups) {
      const { error } = await supabase.from(g.table as any).delete().eq("user_id", userId);
      if (error) throw new Error(`Clearing ${g.table}: ${error.message}`);
    }
  }

  const result: BackupCounts = {
    trades: 0,
    journals: 0,
    setupPlans: 0,
    chartAnalyses: 0,
    gamePlans: 0,
  };

  for (const g of groups) {
    if (!g.rows.length) continue;
    const rows = g.rows.map((r) => {
      const row = { ...(r as Record<string, unknown>) };
      row.user_id = userId;
      return row;
    });
    // Chunk to avoid payload limits
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from(g.table as any)
        .upsert(slice as any, { onConflict: "id" });
      if (error) throw new Error(`Importing ${g.table}: ${error.message}`);
    }
    switch (g.table) {
      case "trades":
        result.trades += g.rows.length;
        break;
      case "trade_journals":
        result.journals += g.rows.length;
        break;
      case "watch_setups":
        result.setupPlans += g.rows.length;
        break;
      case "chart_analyses":
        result.chartAnalyses += g.rows.length;
        break;
      case "daily_game_plans":
        result.gamePlans += g.rows.length;
        break;
    }
  }

  return result;
}