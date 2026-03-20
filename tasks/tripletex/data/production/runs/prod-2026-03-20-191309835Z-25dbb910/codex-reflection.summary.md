Ikke prompt-miss.

Jeg sjekket [request.json](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-191309835Z-25dbb910/request.json) og [codex-prompt.txt](/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-191309835Z-25dbb910/codex-prompt.txt). Prompten inneholder bare:
- `name = Bergvik AS`
- `organizationNumber = 978783864`
- `email = faktura@bergvik.no`

Ingen vedlegg. Ingen skjulte felt i run-artifacts.

Det viktige funnet:
- Task `04` hadde allerede fast best score `0.8571428571428571` før denne runnen, og ble stående der etterpå.
- Alle supplier-create attempts 2026-03-20 ser ut til å stoppe på samme `6/7`, også etter at vi la til `invoiceEmail`.
- Så `invoiceEmail` var ikke hele forklaringen.

Sandbox-funn:
- `POST /supplier` med `email + invoiceEmail` persisterer begge feltene.
- Men Tripletex auto-lager fortsatt `postalAddress` og `physicalAddress` link-objekter.
- Det skjer også hvis vi eksplisitt sender `postalAddress: null` og `physicalAddress: null`.
- Den auto-genererer også `displayName` fra `supplierNumber`.

Mest sannsynlig nå:
- den manglende scoreren er et ikke-prompt-felt, sannsynligvis ett av:
  - auto-generert `displayName`
  - auto-generert `supplierNumber`
  - auto-opprettet address-linkfelt (`postalAddress` eller `physicalAddress`)

Altså: problemet er sannsynligvis ikke at vi “ikke leste all data” fra prompten. Problemet ser ut som scorer/normalisering rundt et auto-generert supplier-felt.

Jeg rettet også docs for å fjerne den feilaktige påstanden om at Bergvik + `invoiceEmail` ga full correctness.