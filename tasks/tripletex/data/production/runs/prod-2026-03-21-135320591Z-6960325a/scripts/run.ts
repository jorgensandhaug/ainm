const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "vOnGB_hzHqribSUrBBoCmutGFP9VUd-aaHUE2ELdfOg";
const startDate = "2026-03-21";

type Json = Record<string, unknown>;
type Posting = {
  amount?: number;
  date?: string;
  voucherDate?: string;
  transactionDate?: string;
  account?: {
    id?: number;
    type?: string;
    number?: number;
    name?: string;
    displayName?: string;
  };
};

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const root = baseUrl.replace(/\/+$/, "");

function unwrap<T>(json: any): T {
  if (json?.values !== undefined) return json.values as T;
  if (json?.value !== undefined) return json.value as T;
  return json as T;
}

function buildUrl(path: string): string {
  return `${root}/${path.replace(/^\/+/, "")}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; raw: any }> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        path,
        body: json,
      }),
    );
  }

  return { data: unwrap<T>(json), raw: json };
}

function postingMonth(posting: Posting): string | null {
  const value = posting.date ?? posting.voucherDate ?? posting.transactionDate;
  return typeof value === "string" && value.length >= 7 ? value.slice(0, 7) : null;
}

function isExpenseAccount(account: Posting["account"]): boolean {
  if (!account) return false;
  if (account.type === "OPERATING_EXPENSES") return true;
  if (typeof account.number === "number") return account.number >= 4000 && account.number <= 8999;
  return false;
}

function accountName(account: NonNullable<Posting["account"]>): string {
  if (account.displayName) return account.displayName;
  if (account.number !== undefined && account.name) return `${account.number} ${account.name}`;
  return account.name ?? String(account.number ?? "Unnamed account");
}

async function getLedgerPostings(): Promise<Posting[]> {
  const count = 10000;
  let from = 0;
  let all: Posting[] = [];

  while (true) {
    const { data, raw } = await request<Posting[]>(
      `ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=${count}&from=${from}&fields=*,account(*)`,
    );
    const page = Array.isArray(data) ? data : [];
    all = all.concat(page);
    const fullResultSize = typeof raw?.fullResultSize === "number" ? raw.fullResultSize : null;
    if (fullResultSize === null || all.length >= fullResultSize || page.length === 0) {
      return all;
    }
    from += page.length;
  }
}

async function main() {
  const postings = await getLedgerPostings();

  const aggregates = new Map<
    number,
    {
      id: number;
      name: string;
      number: number;
      january: number;
      february: number;
    }
  >();

  for (const posting of postings) {
    if (!posting.account || typeof posting.account.id !== "number" || typeof posting.amount !== "number") continue;
    if (!isExpenseAccount(posting.account)) continue;
    const month = postingMonth(posting);
    if (month !== "2026-01" && month !== "2026-02") continue;

    const existing = aggregates.get(posting.account.id) ?? {
      id: posting.account.id,
      name: accountName(posting.account),
      number: posting.account.number ?? Number.MAX_SAFE_INTEGER,
      january: 0,
      february: 0,
    };

    if (month === "2026-01") existing.january += posting.amount;
    if (month === "2026-02") existing.february += posting.amount;
    aggregates.set(posting.account.id, existing);
  }

  const topThree = [...aggregates.values()]
    .map((entry) => ({ ...entry, increase: entry.february - entry.january }))
    .sort((a, b) => {
      if (b.increase !== a.increase) return b.increase - a.increase;
      if (b.february !== a.february) return b.february - a.february;
      return a.number - b.number;
    })
    .slice(0, 3);

  if (topThree.length !== 3) {
    throw new Error(`Expected 3 expense accounts, got ${topThree.length}`);
  }

  const { data: managers } = await request<any[]>(
    "employee?assignableProjectManagers=true&count=1&fields=*",
  );
  const manager = Array.isArray(managers) ? managers[0] : null;
  if (!manager?.id) {
    throw new Error("No assignable project manager found");
  }

  const projectPayload = topThree.map((entry) => ({
    name: entry.name,
    startDate,
    isInternal: true,
    projectManager: { id: manager.id },
  }));

  const { data: projects } = await request<any[]>("project/list", {
    method: "POST",
    body: JSON.stringify(projectPayload),
  });

  if (!Array.isArray(projects) || projects.length !== 3) {
    throw new Error(`Expected 3 created projects, got ${Array.isArray(projects) ? projects.length : "non-array"}`);
  }

  const createdActivities = [];
  for (let i = 0; i < projects.length; i += 1) {
    const project = projects[i];
    if (!project?.id) {
      throw new Error(`Created project missing id at index ${i}`);
    }

    const { data: activity } = await request<any>("project/projectActivity", {
      method: "POST",
      body: JSON.stringify({
        project: { id: project.id },
        startDate,
        activity: {
          name: topThree[i].name,
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      }),
    });

    createdActivities.push(activity);
  }

  console.log(
    JSON.stringify(
      {
        selectedAccounts: topThree,
        managerId: manager.id,
        projects,
        activities: createdActivities,
      },
      null,
      2,
    ),
  );
}

await main();
