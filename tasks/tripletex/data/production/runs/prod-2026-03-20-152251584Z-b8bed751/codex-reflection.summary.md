Blokkert av ugyldig/utløpt Tripletex-session token.

Før token døde rakk jeg dette:
- prosjektets hourly-rate-holder på [register_hours_and_invoice.ts](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-152251584Z-b8bed751/scripts/register_hours_and_invoice.ts) / Tripletex-prosjekt `401935785` ble endret fra `TYPE_FIXED_HOURLY_RATE` til `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
- timeregistrering ble opprettet: entry `175904498` for Silje Strand på `2026-03-20`, 5 timer på aktivitet `Design`, prosjekt `Skytjeneste-oppsett`
- den entryen fikk `hourlyRate=0`, så korrekt sats `1750` ble ikke etablert
- prosjektfaktura ble ikke opprettet

Siste live-feil:
- først `403` på uke-godkjenning
- deretter `422` ved forsøk på å opprette prosjektspesifikk sats
- deretter `403 {"error":"Invalid or expired token"}` på videre kall

Kan fullføre straks du gir ny gyldig session token.