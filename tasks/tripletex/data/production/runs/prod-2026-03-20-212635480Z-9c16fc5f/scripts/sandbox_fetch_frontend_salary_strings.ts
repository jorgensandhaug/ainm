const startUrl = process.argv[2] ?? "https://app.tripletex.no/";
const pattern = new RegExp(
  process.argv[3] ??
    String.raw`salary|payslip|wagePeriodTransaction|paymentTypeOut|salaryV2|fullf.r|l.nnskj.ring|complete|approval|approve|utbetal`,
  "i",
);
const tripletexToken =
  process.env.TRIPLETEX_SESSION_TOKEN ??
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const authHeader =
  process.env.USE_TRIPLETEX_AUTH === "1"
    ? `Basic ${Buffer.from(`0:${tripletexToken}`).toString("base64")}`
    : null;

function absolutize(base: string, value: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

async function fetchText(url: string): Promise<{ url: string; status: number; text: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "bun",
      accept: "text/html,application/javascript,text/javascript,*/*",
      ...(authHeader ? { authorization: authHeader } : {}),
    },
  });
  return {
    url: response.url,
    status: response.status,
    text: await response.text(),
  };
}

function extractScriptUrls(base: string, html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    urls.add(absolutize(base, match[1]));
  }
  return [...urls];
}

function summarizeMatches(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/[^"'`\s]{0,80}(?:salary|payslip|wagePeriodTransaction|paymentTypeOut|salaryV2|approve|approval|complete|utbetal)[^"'`\s]{0,80}/gi)) {
    out.add(match[0]);
    if (out.size >= 80) break;
  }
  return [...out];
}

const page = await fetchText(startUrl);
console.log(JSON.stringify({
  startUrl,
  finalUrl: page.url,
  status: page.status,
  htmlLength: page.text.length,
  pattern: String(pattern),
}, null, 2));

const scriptUrls = extractScriptUrls(page.url, page.text);
console.log(JSON.stringify({ scriptCount: scriptUrls.length, scriptUrls }, null, 2));

for (const scriptUrl of scriptUrls) {
  const js = await fetchText(scriptUrl);
  const matched = pattern.test(js.text);
  console.log(JSON.stringify({
    scriptUrl,
    finalUrl: js.url,
    status: js.status,
    length: js.text.length,
    matched,
    matches: matched ? summarizeMatches(js.text) : [],
  }, null, 2));
}
