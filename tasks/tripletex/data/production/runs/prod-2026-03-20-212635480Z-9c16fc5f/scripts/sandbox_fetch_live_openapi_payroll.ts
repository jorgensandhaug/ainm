const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";

const response = await fetch(`${baseUrl}/openapi.json`);
if (!response.ok) {
  throw new Error(`GET /openapi.json failed: ${response.status} ${await response.text()}`);
}

const spec = (await response.json()) as {
  paths?: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
};

const pathKeys = Object.keys(spec.paths ?? {});
const payrollPaths = pathKeys.filter(
  (path) =>
    path.includes("/salary") ||
    path.includes("/payment") ||
    path.includes("/payslip") ||
    path.includes("/wage"),
);
const salaryV2Schemas = Object.keys(spec.components?.schemas ?? {}).filter((name) =>
  name.includes("SalaryV2"),
);

console.log(
  JSON.stringify(
    {
      totalPathCount: pathKeys.length,
      payrollPaths,
      salaryV2Schemas,
    },
    null,
    2,
  ),
);
