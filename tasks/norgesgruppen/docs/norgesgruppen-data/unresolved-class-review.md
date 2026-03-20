# Unresolved Class Review

Purpose: convert unresolved-name stats into concrete join decisions.

Legend:

- `Map likely`: strong enough to use as a provisional packshot join.
- `Manual review`: plausible same-product or shortened-name case, but not safe to auto-map.
- `Do not auto-map`: nearest metadata rows are sibling variants, not the same SKU.
- `Missing ref likely`: no convincing product-image row in metadata.
- `Sentinel`: special class; keep separate.

## Likely Same-Product Joins

| category_id | anns | shelf category | proposed metadata product | why | action |
|---|---:|---|---|---|---|
| `12` | `150` | `Leksands Rutbit` | `7312080005756` `LEKSANDS KNEKKE RUTBIT 200G` | same brand + `RUTBIT`; best knekkebrod match by tokens; direct cross-category overlap at IoU `0.868957` in image `251` | `Map likely` |
| `36` | `14` | `MÜSLI FRUKT MÜSLI 700G AXA` | `7044416013684` `MUSLI FRUKT 700G AXA` | looks like orthography / spelling normalization only; same size and brand; stronger than other AXA muesli candidates | `Map likely` |

## Plausible But Unsafe Family Matches

These are close enough to review manually, but not safe enough to collapse automatically for exact-category evaluation.

| category_id | anns | shelf category | nearest metadata rows | read | action |
|---|---:|---|---|---|---|
| `341` | `76` | `EVERGOOD CLASSIC HELE BØNNER 500G` | `EVERGOOD ESPRESSO HELE BØNNER 500G`, `EVERGOOD DARK ROAST HELE BØNNER 500G` | same brand/format/size, but `CLASSIC` vs `ESPRESSO` / `DARK ROAST` is variant-level, not cosmetic | `Do not auto-map` |
| `141` | `63` | `EVERGOOD CLASSIC PRESSMALT 250G` | `EVERGOOD CLASSIC KOKMALT 250G`, `EVERGOOD CLASSIC FILTERMALT 250G`, `EVERGOOD DARK ROAST PRESSMALT 250G` | strong family match, but grind/prep variant differs | `Do not auto-map` |
| `348` | `24` | `ALI ORIGINAL HELE BØNNER 250G` | `ALI ORIGINAL FILTERMALT 250G`, `ALI ORIGINAL KOKMALT 250G` | same brand/size, different bean-vs-ground form factor | `Do not auto-map` |
| `144` | `19` | `FRIELE FROKOST KOKMALT 250G` | `FRIELE FROKOST FILTERMALT 250G`, `FRIELE FROKOST PRESSKANNE 250G` | same family, different prep/grind | `Do not auto-map` |
| `127` | `9` | `FRIELE FROKOST HEL 500G` | `FRIELE FROKOST FILTERMALT 250G`, `FRIELE FROKOST PRESSKANNE 250G` | same family only; size/form mismatch too large | `Do not auto-map` |
| `182` | `13` | `FRIELE INSTANT 200G` | `FRIELE INSTANT GULL 100G REFILL`, `PULVERKAFFE INSTANT 200G FIRST PRICE` | nearest rows capture family, not same product | `Do not auto-map` |
| `155` | `3` | `MELANGE FLYTENDE MARGARIN M/SMØR 500ML` | `MELANGE FLYTENDE 500ML` | maybe shortened metadata naming, but not enough evidence yet | `Manual review` |

## Likely Missing Reference Products

These look like genuine gaps in the product-image payload, not naming noise.

| category_id | anns | shelf category | strongest clue | action |
|---|---:|---|---|---|
| `355` | `422` | `unknown_product` | explicit sentinel class | `Sentinel` |
| `30` | `129` | `SJOKORINGER 375G ELDORADO` | nearest exact-family row is weak; no convincing same-product metadata row | `Missing ref likely` |
| `6` | `46` | `Eldorado Økologiske Gårdsegg` | only generic egg/eldorado overlaps, no product-level match | `Missing ref likely` |
| `269` | `33` | `Eldorado Egg fra Toten` | only generic `EGG` token matches | `Missing ref likely` |
| `312` | `33` | `Tørresvik Gård Kvalitetsegg 10stk` | local/farm-style egg name absent from metadata | `Missing ref likely` |
| `185` | `28` | `Eldorado Flytende Gårdsegg` | liquid-egg style row absent; nearest egg rows are not equivalent | `Missing ref likely` |
| `138` | `14` | `Økologiske Egg 10stk` | generic organic egg candidates exist, but no safe exact SKU match | `Manual review` |
| `4` | `10` | `Økologiske Egg 6stk` | same issue as above | `Manual review` |
| `195` | `10` | `Økologiske Egg Brune 6stk` | same issue as above | `Manual review` |
| `286` | `9` | `EGG L 10STK TOTEN` | locality/producer absent from metadata | `Missing ref likely` |
| `216` | `13` | `Sunnmørsegg` | local producer absent from metadata | `Missing ref likely` |
| `288` | `3` | `Sunnmørsegg 10stk` | same | `Missing ref likely` |
| `163` | `6` | `Galåvolden Store Gårdsegg 6stk` | local producer absent from metadata | `Missing ref likely` |
| `159` | `4` | `Galåvolden Store Gårdsegg 10stk` | same | `Missing ref likely` |
| `301` | `6` | `Gårdsegg fra Fana 10stk` | locality/producer absent from metadata | `Missing ref likely` |
| `51` | `5` | `Tørresvik Gårdsegg 6stk` | same | `Missing ref likely` |
| `254` | `2` | `SMØREMYK MELKEFRI 400G BERIT` | nearest `SMØREMYK` rows are different brand/product | `Missing ref likely` |
| `277` | `12` | `ALPEN MÜSLI WEETABIX` | only weak brand-level `WEETABIX` overlap | `Missing ref likely` |
| `150` | `17` | `Sætre GullBar` | no convincing metadata family row | `Missing ref likely` |
| `10` | `12` | `Jacobs 10 Gårdsegg` | reads like a producer/local egg label absent from metadata | `Missing ref likely` |
| `129` | `6` | `SVARTHAVREGRYN LETTKOKTE 900G DEN SORTE` | nearest row is a different oat/rice product | `Missing ref likely` |

## Exact-Name Ambiguity Traps

These already match metadata by normalized name, but are still unsafe.

| category_id | anns | category | issue | action |
|---|---:|---|---|---|
| `280` | `262` | `RISKAKER 100G FIRST PRICE` | two metadata products share the exact same normalized name; one has `2` views, one has `6` | do not auto-pick one without barcode/image review |
| `300` | `1` | empty name | exact normalized match collides with `5` empty-name metadata rows | never auto-map |

## Metadata Rows With No Images

These classes have metadata rows, but no packshots on disk.

| category_id | anns | category | metadata product_code | action |
|---|---:|---|---|---|
| `215` | `54` | `BLUE FRUIT TE PYRAMIDE 20POS LIPTON` | `7310390855122` | treat as no-packshot class |
| `76` | `1` | `BRUSCHETTA LIGURISK 130G OLIVINO` | `8032529645341` | treat as no-packshot class |

## Practical Use

- For reference-based classification, only the two `Map likely` rows look worth folding in immediately.
- The coffee-family rows are the biggest trap: high string similarity, but variant-level differences that would hurt exact `category_id` scoring.
- The egg tail looks structurally under-covered by packshots, not just poorly normalized.
