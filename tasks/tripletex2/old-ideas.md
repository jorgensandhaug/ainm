### Features
- [ ] Flere stegs pipeline: Egen translator agent. Vil øke performance mye spesielt på norsk sannsynligvis. Er få fagbegreper, så dette steget kan gå fort og få høy presisjon. Dersom det er få prompts: Kan være deterministic translation

- [ ] Wrappe http endpointent i en cli som agenten er bedre på å bruke, og som krever mindre tokens for execution. Evt MCP. Evt programmeringsspråk (python library)

- [ ] Eliminere støy og cleanup for agenten. Eks: Eliminiere nixos støy fra global AGENTS.md

- [ ] Specialist routing. Tenker spesielt på forskjellen mellom "create" og "correct" som sannsynligvis er ganske forskjellig. Altså: apisurfacen og oppgavepoolen er ikke særlig stor. Vi kan være enormt spesifike med instuksjoner for å løse akkurat det vi må.

### Research
- [ ] Extracte alle http-requests brukt av agenten for å løse de tidligere oppgavene, slik at vi for hver oppgave, har "disse callsene ble brukt". Dette er viktig for å kunne styre instruksjonene. Det vi ønsker er en agent som kan se på en planlagt rekke api-calls, også vurdere om den er optimal og om den er korrekt.

- [ ] Researche poengsystemet

- [ ] Researche apiet (konseptuelt)


Stukturelt: Burde ikke "løse problemet" steg for steg, det handler om å optimalisere for få api-calls. Må derfor se på helheten. Agenten burde planlegge hele regla før man begynner å calle apiet (de fleste oppgaver er ikke avhengige av informasjon fra apiet heller ville jeg trodd, kun å gi input til apiet)


Derfor: Inspirert av programmatic tool calling:
(Potensielt) Wrappe endpointet på en eller annen måte (ikke så sykt komplisert/stort). Får se på dette
Lage et rammeverk for å skrive ned og planlegge alle api-kall brukt i hele pipelinen til requesten er løst. Da kan man også evaluere. Eventuelt. Kicke off tre i parallell, og judge alle på correctness, også utføre den med færrest kall.


### Tanker
- Burde binde oss til codex/claude. Er så enormt stor verdi av evig tokens for iterering. +spesifikk RL i disse harnessene. Ikke vits å bygge fra bunnen
- 