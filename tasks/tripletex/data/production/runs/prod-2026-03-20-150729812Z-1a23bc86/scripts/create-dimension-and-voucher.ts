const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "ys7UTns5i8xowTuVQ6nFgfVzW-l_oIzjtGaFNLBpFVQ";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const today = "2026-03-20";
const amount = 38100;

type Wrapped<T> = { value: T; values?: T[]; fullResultSize?: number };

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} ${path}\n${JSON.stringify(data)}`
    );
  }

  return data as T;
}

async function getAccounts(targetAccountNumber: string) {
  const first = await request<Wrapped<any[]>>(
    `/ledger/account?number=${targetAccountNumber},1920&fields=*`,
    { method: "GET" }
  );
  const values = first.values ?? [];
  const target = values.find((account) => String(account.number) === targetAccountNumber);
  const bank = values.find((account) => String(account.number) === "1920");

  if (target && bank) {
    return { target, bank };
  }

  const fallback = await request<Wrapped<any[]>>(
    `/ledger/account?isBankAccount=true&fields=*`,
    { method: "GET" }
  );
  const bankFallback = (fallback.values ?? []).find(
    (account) => account.isBankAccount || account.isInvoiceAccount
  );

  if (!target || !bankFallback) {
    throw new Error(
      `Unable to resolve accounts: target=${JSON.stringify(target)} bank=${JSON.stringify(
        bankFallback
      )}`
    );
  }

  return { target, bank: bankFallback };
}

async function main() {
  const dimension = await request<Wrapped<any>>("/ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({
      dimensionName: "Kostsenter",
      active: true,
    }),
  });

  const dimensionIndex = dimension.value.dimensionIndex;
  const dimensionField = `freeAccountingDimension${dimensionIndex}`;

  const itValue = await request<Wrapped<any>>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: "IT",
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const hrValue = await request<Wrapped<any>>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: "HR",
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const { target, bank } = await getAccounts("6590");

  const voucher = await request<Wrapped<any>>("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: today,
      description: 'Bilag konto 6590, Kostsenter "HR"',
      voucherType: null,
      postings: [
        {
          row: 1,
          date: today,
          description: 'Kostsenter "HR"',
          account: { id: target.id },
          currency: { id: 1 },
          amount,
          amountCurrency: amount,
          amountGross: amount,
          amountGrossCurrency: amount,
          [dimensionField]: { id: hrValue.value.id },
        },
        {
          row: 2,
          date: today,
          description: 'Kostsenter "HR"',
          account: { id: bank.id },
          currency: { id: 1 },
          amount: -amount,
          amountCurrency: -amount,
          amountGross: -amount,
          amountGrossCurrency: -amount,
        },
      ],
    }),
  });

  const postings = voucher.value.postings ?? [];
  const targetPosting = postings.find((posting: any) => posting.account?.id === target.id);

  console.log(
    JSON.stringify(
      {
        dimension: {
          id: dimension.value.id,
          name: dimension.value.dimensionName,
          dimensionIndex: dimension.value.dimensionIndex,
        },
        values: [
          { id: itValue.value.id, displayName: itValue.value.displayName },
          { id: hrValue.value.id, displayName: hrValue.value.displayName },
        ],
        voucher: {
          id: voucher.value.id,
          number: voucher.value.number,
          targetAccountId: target.id,
          targetAmount: targetPosting?.amount,
          linkedDimensionValueId: targetPosting?.[dimensionField]?.id,
        },
      },
      null,
      2
    )
  );
}

await main();
