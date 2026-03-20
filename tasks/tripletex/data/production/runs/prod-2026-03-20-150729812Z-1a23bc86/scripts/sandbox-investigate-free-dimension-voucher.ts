const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const today = "2026-03-20";
const amount = 38100;
const suffix = `${Date.now()}`.slice(-6);

type Wrapped<T> = { value?: T; values?: T[]; fullResultSize?: number };

async function request<T>(path: string, init: RequestInit): Promise<{ status: number; body: T }> {
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
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        path,
        body,
      })
    );
  }

  return { status: response.status, body: body as T };
}

async function requestExpectFailure(
  path: string,
  init: RequestInit
): Promise<{ status: number; body: any }> {
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
  const body = text ? JSON.parse(text) : null;

  if (response.ok) {
    throw new Error(`Expected failure for ${path}, got ${response.status}`);
  }

  return { status: response.status, body };
}

async function main() {
  const dimension = await request<Wrapped<any>>("/ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({
      dimensionName: `Kostsenter ${suffix}`,
      active: true,
    }),
  });

  const dimensionIndex = dimension.body.value!.dimensionIndex;
  const dimensionField = `freeAccountingDimension${dimensionIndex}`;

  const itValue = await request<Wrapped<any>>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: `IT${suffix}`,
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const hrValue = await request<Wrapped<any>>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: `HR${suffix}`,
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const failedVoucher = await requestExpectFailure("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: today,
      description: `Probe voucher number-only ${suffix}`,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: today,
          description: `Probe ${suffix}`,
          account: { number: "6590" },
          currency: { id: 1 },
          amount,
          amountCurrency: amount,
          amountGross: amount,
          amountGrossCurrency: amount,
          [dimensionField]: { id: hrValue.body.value!.id },
        },
        {
          row: 2,
          date: today,
          description: `Probe ${suffix}`,
          account: { number: "1920" },
          currency: { id: 1 },
          amount: -amount,
          amountCurrency: -amount,
          amountGross: -amount,
          amountGrossCurrency: -amount,
        },
      ],
    }),
  });

  const accounts = await request<Wrapped<any[]>>("/ledger/account?number=6590,1920&fields=*", {
    method: "GET",
  });

  const values = accounts.body.values ?? [];
  const target = values.find((account) => String(account.number) === "6590");
  const bank = values.find((account) => String(account.number) === "1920");

  if (!target || !bank) {
    throw new Error(`Missing target/bank account in ${JSON.stringify(values)}`);
  }

  const successfulVoucher = await request<Wrapped<any>>("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: today,
      description: `Validated voucher ${suffix}`,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: today,
          description: `Validated ${suffix}`,
          account: { id: target.id },
          currency: { id: 1 },
          amount,
          amountCurrency: amount,
          amountGross: amount,
          amountGrossCurrency: amount,
          [dimensionField]: { id: hrValue.body.value!.id },
        },
        {
          row: 2,
          date: today,
          description: `Validated ${suffix}`,
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

  const postings = successfulVoucher.body.value!.postings ?? [];
  const targetPosting = postings.find((posting: any) => posting.account?.id === target.id);

  console.log(
    JSON.stringify(
      {
        dimension: {
          id: dimension.body.value!.id,
          name: dimension.body.value!.dimensionName,
          dimensionIndex,
        },
        values: [
          { id: itValue.body.value!.id, displayName: itValue.body.value!.displayName },
          { id: hrValue.body.value!.id, displayName: hrValue.body.value!.displayName },
        ],
        numberOnlyVoucherAttempt: failedVoucher,
        accountLookup: {
          target: { id: target.id, number: target.number, name: target.name },
          bank: { id: bank.id, number: bank.number, name: bank.name },
        },
        successfulVoucher: {
          id: successfulVoucher.body.value!.id,
          number: successfulVoucher.body.value!.number,
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
