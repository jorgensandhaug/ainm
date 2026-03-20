Ikkje fullført.

Script ligg i [register_supplier_invoice.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-132045439Z-f59b2940/scripts/register_supplier_invoice.ts). `POST /incomingInvoice` var først validerbar men feila på manglande `orderLines.externalId`, deretter 403 på feature-tilgang. Eg bytte til voucher-flyt, men då var session-tokenet utløpt: `403 Invalid or expired token`.

Mogleg delvis sideeffekt: leverandøren `Fossekraft AS` kan alt vere oppretta. Sjølve leverandørfakturaa vart ikkje registrert. Treng ny Tripletex session token for å fullføre.