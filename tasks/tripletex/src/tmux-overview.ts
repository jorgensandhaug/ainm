import blessed from "neo-blessed";
import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type TmuxWindow = {
  active: boolean;
  index: number;
  name: string;
  paneCommand: string;
  paneDead: boolean;
};

type RunSummary = {
  active: boolean;
  attributionStatus: string;
  bestScore: string;
  correctness: string;
  fileCount: number | null;
  idlePane: boolean;
  phase: string;
  reflectionStatus: string;
  runId: string;
  runScore: string;
  solveStatus: string;
  taskId: string;
  windowIndex: number;
};

const sessionName = Bun.argv[2] ?? "ainm-tripletex-sessions";
const refreshMs = Math.max(Number(Bun.argv[3] ?? 2000), 500);
const repoRoot = resolve(import.meta.dir, "..");
const productionRunsDir = join(repoRoot, "data", "production", "runs");
const testingRunsDir = join(repoRoot, "data", "testing", "runs");
let showHistory = true;

function runCommand(args: string[]) {
  const proc = Bun.spawnSync(args, {
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    code: proc.exitCode,
    stderr: new TextDecoder().decode(proc.stderr).trim(),
    stdout: new TextDecoder().decode(proc.stdout),
  };
}

async function readJson(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function detectRunId(windowName: string) {
  if (windowName.endsWith("-reflect")) return { phase: "reflect", runId: windowName.slice(0, -8) };
  if (windowName.endsWith("-score-review")) return { phase: "score", runId: windowName.slice(0, -13) };
  if (windowName.startsWith("prod-") || windowName.startsWith("test-")) return { phase: "solve", runId: windowName };
  return undefined;
}

function resolveRunDir(runId: string) {
  if (runId.startsWith("prod-")) return join(productionRunsDir, runId);
  if (runId.startsWith("test-")) return join(testingRunsDir, runId);
  return undefined;
}

function parseTaskNumber(taskId: string) {
  const value = Number(taskId);
  return Number.isFinite(value) ? value : null;
}

function taskTier(taskId: string) {
  const n = parseTaskNumber(taskId);
  if (n === null) return "-";
  if (n <= 8) return "T1";
  if (n <= 18) return "T2";
  if (n <= 30) return "T3";
  return "-";
}

function taskMaxScore(taskId: string) {
  const tier = taskTier(taskId);
  if (tier === "T1") return 2;
  if (tier === "T2") return 4;
  if (tier === "T3") return 6;
  return null;
}

function formatScoreValue(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function leaderboardBestScore(taskId: string, leaderboard: Record<string, unknown> | undefined) {
  if (!leaderboard || !Array.isArray(leaderboard.entries)) return null;
  const entry = leaderboard.entries.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return String(record.tx_task_id ?? "") === taskId;
  }) as Record<string, unknown> | undefined;
  return typeof entry?.best_score === "number" ? entry.best_score : null;
}

function compactStatus(status: string) {
  if (status === "running") return "run";
  if (status === "exited") return "exit";
  if (status === "completed") return "done";
  if (status === "timed_out") return "tout";
  if (status === "launched") return "boot";
  if (status === "skipped") return "skip";
  if (status === "missing") return "miss";
  if (status === "pending") return "pend";
  return status.slice(0, 4);
}

function compactRunLabel(runId: string, phase: string) {
  const match = /^(prod|test)-\d{4}-\d{2}-\d{2}-(\d{6})\d{3}Z-[a-z0-9]{8}$/i.exec(runId);
  const id = match ? `${match[1] === "prod" ? "p" : "t"}${match[2]}` : runId;
  return `${id} ${phase === "solve" ? "run" : phase}`;
}

function isLiveRow(row: RunSummary) {
  return (
    (row.active && !row.idlePane) ||
    row.solveStatus === "running" ||
    row.reflectionStatus === "running" ||
    row.reflectionStatus === "launched" ||
    ((row.solveStatus === "pending" || row.solveStatus === "missing") && !row.idlePane)
  );
}

function statusColor(status: string) {
  if (status === "running" || status === "completed") return "green";
  if (status === "timed_out" || status === "missing") return "red";
  if (status === "launched" || status === "pending") return "cyan";
  if (status === "skipped" || status === "exited") return "gray";
  return "yellow";
}

function scoreColor(score: string) {
  if (score === "-" || score === "skipped" || score === "pending") return "gray";
  if (score === "100%") return "green";
  if (score === "0%") return "red";
  return "yellow";
}

function attrLabel(raw: string) {
  if (!raw || raw === "-") return { color: "gray", text: "-" };
  if (raw === "unique_attempt_delta" || raw === "single_new_submission") return { color: "green", text: "sure" };
  if (raw.includes("ambiguous")) return { color: "yellow", text: "maybe" };
  if (raw.includes("timeout") || raw.includes("missing")) return { color: "red", text: "bad" };
  return { color: "yellow", text: raw.replaceAll("_", ".") };
}

function formatCell(text: string, width: number) {
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, " ");
}

function markup(text: string, color?: string, bold?: boolean) {
  let value = text;
  if (color) value = `{${color}-fg}${value}{/${color}-fg}`;
  if (bold) value = `{bold}${value}{/bold}`;
  return value;
}

async function loadWindows() {
  const result = runCommand([
    "tmux",
    "list-windows",
    "-t",
    sessionName,
    "-F",
    "#{window_index}\t#{window_name}\t#{window_active}\t#{pane_current_command}\t#{pane_dead}",
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr || "tmux list-windows failed");
  }

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [index, name, active, paneCommand, paneDead] = line.split("\t");
      return {
        active: active === "1",
        index: Number(index),
        name: name ?? "",
        paneCommand: paneCommand ?? "",
        paneDead: paneDead === "1",
      } satisfies TmuxWindow;
    })
    .sort((a, b) => a.index - b.index);
}

async function summarizeWindow(window: TmuxWindow): Promise<RunSummary | undefined> {
  const meta = detectRunId(window.name);
  if (!meta) return undefined;
  const runDir = resolveRunDir(meta.runId);
  if (!runDir || !existsSync(runDir)) {
    return {
      active: window.active,
      attributionStatus: "-",
      bestScore: "-",
      correctness: "-",
      fileCount: null,
      idlePane: window.paneCommand === "zsh" && !window.paneDead,
      phase: meta.phase,
      reflectionStatus: "-",
      runId: meta.runId,
      runScore: "-",
      solveStatus: "missing",
      taskId: "-",
      windowIndex: window.index,
    };
  }

  const [manifest, agentStatus, reflectionStatus, scoreStatus, taskAttribution, leaderboardAfter, leaderboardBefore] =
    await Promise.all([
      readJson(join(runDir, "manifest.json")),
      readJson(join(runDir, "agent-run.status.json")),
      readJson(join(runDir, "codex-reflection.status.json")),
      readJson(join(runDir, "submission-score.json")),
      readJson(join(runDir, "task-attribution.json")),
      readJson(join(runDir, "leaderboard.after.json")),
      readJson(join(runDir, "leaderboard.before.json")),
    ]);

  const taskId =
    typeof taskAttribution?.tx_task_id === "string" || typeof taskAttribution?.tx_task_id === "number"
      ? String(taskAttribution.tx_task_id)
      : "-";
  const best = leaderboardBestScore(taskId, leaderboardAfter) ?? leaderboardBestScore(taskId, leaderboardBefore);
  const max = taskMaxScore(taskId);

  return {
    active: window.active,
    attributionStatus:
      typeof taskAttribution?.inference_status === "string"
        ? taskAttribution.inference_status
        : typeof taskAttribution?.status === "string"
          ? taskAttribution.status
          : "-",
    bestScore: typeof best === "number" && typeof max === "number" ? `${formatScoreValue(best)}/${max}` : "-",
    correctness:
      typeof scoreStatus?.correctness === "number"
        ? `${Math.round(scoreStatus.correctness * 100)}%`
        : typeof scoreStatus?.status === "string"
          ? scoreStatus.status
          : "-",
    fileCount: Array.isArray(manifest?.attachments) ? manifest.attachments.length : null,
    idlePane: window.paneCommand === "zsh" && !window.paneDead,
    phase: meta.phase,
    reflectionStatus: typeof reflectionStatus?.status === "string" ? reflectionStatus.status : "-",
    runId: meta.runId,
    runScore:
      typeof scoreStatus?.score_raw === "number" && typeof scoreStatus?.score_max === "number"
        ? `${scoreStatus.score_raw}/${scoreStatus.score_max}`
        : "-",
    solveStatus: typeof agentStatus?.status === "string" ? agentStatus.status : "pending",
    taskId,
    windowIndex: window.index,
  };
}

function sortRows(rows: RunSummary[]) {
  return [...rows].sort((a, b) => {
    const taskA = parseTaskNumber(a.taskId);
    const taskB = parseTaskNumber(b.taskId);
    if (taskA !== null || taskB !== null) {
      if (taskA === null) return 1;
      if (taskB === null) return -1;
      if (taskA !== taskB) return taskA - taskB;
    }
    if (isLiveRow(a) !== isLiveRow(b)) return isLiveRow(a) ? -1 : 1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.windowIndex - b.windowIndex;
  });
}

function rowMarkup(row: RunSummary) {
  const attr = attrLabel(row.attributionStatus);
  const cells = [
    formatCell(String(row.windowIndex), 3),
    formatCell(row.phase === "solve" ? "S" : row.phase === "reflect" ? "R" : "$", 1),
    markup(formatCell(compactStatus(row.solveStatus), 4), statusColor(row.solveStatus)),
    markup(formatCell(compactStatus(row.reflectionStatus), 4), statusColor(row.reflectionStatus)),
    markup(formatCell(row.correctness.replace("%", ""), 5), scoreColor(row.correctness)),
    formatCell(row.runScore, 5),
    formatCell(row.taskId, 4),
    formatCell(taskTier(row.taskId), 4),
    formatCell(row.bestScore, 5),
    formatCell(row.fileCount === null ? "-" : String(row.fileCount), 2),
    markup(formatCell(attr.text, 6), attr.color),
    formatCell(compactRunLabel(row.runId, row.phase), 16),
  ];
  return cells.join(" ");
}

function buildHistoryText(historyRows: RunSummary[]) {
  const grouped = new Map<string, RunSummary[]>();
  for (const row of historyRows) {
    const key = row.taskId === "-" ? "unknown" : row.taskId;
    const arr = grouped.get(key);
    if (arr) arr.push(row);
    else grouped.set(key, [row]);
  }

  const lines: string[] = [];
  for (const [taskId, rows] of grouped) {
    lines.push(markup(`task ${taskId}  ${taskTier(taskId)}  best ${rows[0]?.bestScore ?? "-"}  n=${rows.length}`, "yellow", true));
    for (const row of rows) lines.push(rowMarkup(row));
    lines.push("");
  }
  return lines.join("\n");
}

const screen = blessed.screen({
  smartCSR: true,
  title: `tripletex overview: ${sessionName}`,
});

const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  border: "line",
  label: " status ",
  style: {
    border: { fg: "cyan" },
  },
});

const liveBox = blessed.box({
  parent: screen,
  top: 3,
  left: 0,
  width: "100%",
  height: "45%",
  tags: true,
  border: "line",
  label: " live ",
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: {
    ch: " ",
    inverse: true,
  },
  style: {
    border: { fg: "green" },
  },
});

const historyBox = blessed.box({
  parent: screen,
  top: "48%",
  left: 0,
  width: "100%",
  height: "52%-1",
  tags: true,
  border: "line",
  label: " history ",
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: {
    ch: " ",
    inverse: true,
  },
  style: {
    border: { fg: "yellow" },
  },
});

async function refresh() {
  try {
    const windows = await loadWindows();
    const rows = sortRows((await Promise.all(windows.map((window) => summarizeWindow(window)))).filter(Boolean) as RunSummary[]);
    const liveRows = rows.filter(isLiveRow);
    const historyRows = rows.filter((row) => !isLiveRow(row));
    const active = windows.find((window) => window.active)?.name ?? "-";
    const runningMain = rows.filter((row) => row.phase === "solve" && row.solveStatus === "running").length;
    const runningFollow = rows.filter((row) => row.phase !== "solve" && row.reflectionStatus === "running").length;

    header.setContent(
      [
        `${markup("tripletex", "cyan", true)} ${sessionName} ${new Date().toISOString()}`,
        `win ${windows.length}  main ${markup(`${runningMain}/8`, runningMain >= 8 ? "red" : "green")}  follow ${markup(String(runningFollow), runningFollow > 0 ? "yellow" : "gray")}  active ${markup(active, "white", true)}`,
      ].join("\n"),
    );

    const tableHeader = `${formatCell("#", 3)} ${formatCell("P", 1)} ${formatCell("main", 4)} ${formatCell("post", 4)} ${formatCell("pct", 5)} ${formatCell("scr", 5)} ${formatCell("task", 4)} ${formatCell("tier", 4)} ${formatCell("best", 5)} ${formatCell("f", 2)} ${formatCell("attr", 6)} run`;
    liveBox.setContent([tableHeader, ...liveRows.map(rowMarkup)].join("\n"));
    historyBox.setContent(buildHistoryText(historyRows) || "{gray-fg}no history{/gray-fg}");
    historyBox.hidden = !showHistory;
    screen.render();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await appendFile("/tmp/tripletex-tmux-overview.error.log", `${new Date().toISOString()} ${message}\n`).catch(() => {});
    header.setContent(`${markup("tripletex", "red", true)} error\n${message}`);
    liveBox.setContent("");
    historyBox.setContent("");
    screen.render();
  }
}

screen.key(["q", "C-c"], () => process.exit(0));
screen.key(["h"], () => {
  showHistory = !showHistory;
  screen.render();
});
screen.key(["tab"], () => {
  if (screen.focused === liveBox) historyBox.focus();
  else liveBox.focus();
});

liveBox.focus();
await refresh();
const timer = setInterval(() => {
  void refresh();
}, refreshMs);

process.on("exit", () => clearInterval(timer));
