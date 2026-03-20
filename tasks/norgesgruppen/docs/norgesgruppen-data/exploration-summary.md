# NorgesGruppen Data Exploration

Generated from extracted payload on disk.

## Key Facts

- Shelf images: `248`
- Shelf annotations: `22731`
- Categories: `356` with id range `0..355`
- Product metadata rows: `329`
- Product dirs on disk: `344`
- Product image files on disk: `1599`

## Docs vs Payload

- Docs say `254` shelf images; payload has `248`.
- Docs say `357` categories / max id `356`; payload has `356` categories / max id `355`.
- Docs describe annotation fields `product_code`, `product_name`, `corrected`; actual annotations only have `area, bbox, category_id, id, image_id, iscrowd`.
- Metadata says `327` products with images and `2` without; disk contains `344` product folders because `17` extra `CUSTOM_*` dirs exist.

## COCO Shape

- File extensions: `{'.jpeg': 38, '.jpg': 210}`
- Unique image dimensions: `114`; top dimensions: `[{'width': 4032, 'height': 3024, 'count': 59}, {'width': 3024, 'height': 4032, 'count': 26}, {'width': 4000, 'height': 3000, 'count': 17}, {'width': 960, 'height': 1280, 'count': 6}, {'width': 3000, 'height': 4000, 'count': 5}, {'width': 3264, 'height': 2448, 'count': 5}]`
- Missing image ids within range sample: `[3, 8, 16, 24, 28, 30, 39, 40, 41, 42, 43, 45, 49, 51, 52, 53, 57, 63, 65, 67, 68, 69, 70, 82, 83, 84, 87, 90, 91, 92, 98, 101, 106, 107, 110, 112, 113, 123, 125, 133, 136, 139, 142, 144, 146, 147, 150, 151, 157, 158]`
- Empty category names: `[{'id': 300, 'name': ''}]`
- Annotations per image: `{'min': 14, 'median': 84.0, 'mean': 91.66, 'max': 235}`
- BBox width stats: `{'min': 10, 'median': 161, 'mean': 185.4, 'max': 1003}`
- BBox height stats: `{'min': 11, 'median': 165, 'mean': 190.12, 'max': 1016}`
- BBox area stats: `{'min': 220, 'median': 26875, 'mean': 40888.01, 'max': 696082}`
- BBox image-area fraction stats: `{'min': 1.8e-05, 'median': 0.003743, 'mean': 0.01, 'max': 0.059236}`
- Long-tail classes: `<=5` anns `84`, `<=10` anns `115`, `<=25` anns `175`

Top categories by annotation count:
- `355` unknown_product (422)
- `86` HAVRE KNEKKEBRØD 300G WASA (398)
- `109` KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA (374)
- `100` EVERGOOD CLASSIC FILTERMALT 250G (368)
- `349` KNEKKEBRØD SPORT+ 210G WASA (364)
- `246` HUSMAN KNEKKEBRØD 260G WASA (322)
- `296` FIBER BALANCE 230G WASA (309)
- `271` FRUKOST KNEKKEBRØD 240G WASA (307)
- `132` FRUKOST FULLKORN 320G WASA (300)
- `207` LEKSANDS KNEKKE FIBERBIT 240G (297)

Bottom categories by annotation count:
- `26` OB PROCOMFORT NORMAL 16ST (1)
- `57` MORENEPOTETER GULE 650G BJERTNÆS&HOEL (1)
- `69` DAVE&JON'S DADLER SOUR COLA 125G (1)
- `76` BRUSCHETTA LIGURISK 130G OLIVINO (1)
- `79` PANNEKAKER GROVE STEKTE 480G ÅMLI (1)
- `81` GRØNN TE CHAI 25POS TWININGS (1)
- `91` SANDWICH PESTO 37G WASA (1)
- `94` HAVREGRYN STORE GLUTENFRI 1KG AXA (1)
- `95` EGG M/L ØKOLOGISKE 10STK VILJE (1)
- `107` FLAT WHITE 16KAPSLER DOLCE GUSTO (1)

Most annotated images:
- `img_00267.jpg` id `267` (235 boxes)
- `img_00260.jpg` id `260` (226 boxes)
- `img_00066.jpg` id `66` (209 boxes)
- `img_00018.jpg` id `18` (198 boxes)
- `img_00014.jpg` id `14` (191 boxes)
- `img_00261.jpg` id `261` (182 boxes)
- `img_00305.jpg` id `305` (182 boxes)
- `img_00006.jpg` id `6` (177 boxes)
- `img_00376.jpg` id `376` (176 boxes)
- `img_00308.jpg` id `308` (174 boxes)

Least annotated images:
- `img_00086.jpg` id `86` (14 boxes)
- `img_00155.jpg` id `155` (24 boxes)
- `img_00100.jpg` id `100` (27 boxes)
- `img_00077.jpg` id `77` (29 boxes)
- `img_00099.jpg` id `99` (29 boxes)
- `img_00209.jpg` id `209` (29 boxes)
- `img_00104.jpg` id `104` (30 boxes)
- `img_00230.jpg` id `230` (31 boxes)
- `img_00088.jpg` id `88` (32 boxes)
- `img_00135.jpg` id `135` (32 boxes)

## Product Reference Shape

- Metadata counts: `{'total_products': 329, 'products_with_images': 327, 'products_without_images': 2, 'total_images': 1582}`
- Images per product distribution on disk: `{1: 28, 2: 30, 3: 18, 4: 28, 5: 125, 6: 85, 7: 30}`
- Image type counts on disk: `{'back': 254, 'bottom': 35, 'front': 316, 'left': 266, 'main': 344, 'right': 240, 'top': 144}`
- Metadata-only missing products: `[{'product_code': '7310390855122', 'product_name': 'BLUE FRUIT TE PYRAMIDE 20POS LIPTON', 'annotation_count': 81, 'corrected_count': 5, 'has_images': False, 'image_types': []}, {'product_code': '8032529645341', 'product_name': 'BRUSCHETTA LIGURISK 130G OLIVINO', 'annotation_count': 1, 'corrected_count': 1, 'has_images': False, 'image_types': []}]`
- Metadata annotation_count sum: `32666` vs COCO annotations `22731`

Extra packshot dirs on disk not in metadata:
- `CUSTOM_001`
- `CUSTOM_002`
- `CUSTOM_003`
- `CUSTOM_004`
- `CUSTOM_005`
- `CUSTOM_006`
- `CUSTOM_007`
- `CUSTOM_008`
- `CUSTOM_009`
- `CUSTOM_010`
- `CUSTOM_011`
- `CUSTOM_012`
- `CUSTOM_013`
- `CUSTOM_014`
- `CUSTOM_015`
- `CUSTOM_016`
- `CUSTOM_017`

Top products by metadata annotation count:
- `7040913336691` EVERGOOD CLASSIC KOKMALT 250G (anns `823`, corrected `155`, images `['back', 'front', 'left', 'main', 'right']`)
- `7300400130288` HAVRE KNEKKEBRØD 300G WASA (anns `606`, corrected `67`, images `['back', 'front', 'left', 'main', 'right']`)
- `7300400482950` KNEKKEBRØD SPORT+ 210G WASA (anns `550`, corrected `20`, images `['back', 'front', 'left', 'main', 'right']`)
- `7300400482165` KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA (anns `540`, corrected `15`, images `['back', 'front', 'left', 'main', 'right']`)
- `7300400248204` FRUKOST KNEKKEBRØD 240G WASA (anns `490`, corrected `21`, images `['back', 'front', 'left', 'main', 'right', 'top']`)
- `7300400127004` FIBER BALANCE 230G WASA (anns `468`, corrected `58`, images `['back', 'front', 'left', 'main', 'right', 'top']`)
- `7300400118415` HUSMAN KNEKKEBRØD 260G WASA (anns `467`, corrected `35`, images `['back', 'front', 'left', 'main', 'right', 'top']`)
- `7312080005749` LEKSANDS KNEKKE FIBERBIT 240G (anns `464`, corrected `14`, images `['back', 'front', 'left', 'main', 'right']`)
- `7350028546879` MAISKAKER OST 125G FRIGGS (anns `443`, corrected `35`, images `['back', 'front', 'left', 'main', 'right', 'top']`)
- `7300400120715` FRUKOST FULLKORN 320G WASA (anns `440`, corrected `23`, images `['back', 'front', 'left', 'main', 'right', 'top']`)

## Alignment Between COCO Categories and Product Metadata

- Matched categories by normalized name: `323` / `356`
- Matched category-product pairs: `328`
- Unmatched categories: `33`
- Unmatched products: `1`
- Count alignment on matched pairs: `{'exact_matches': 77, 'median_absolute_diff': 15.0, 'mean_absolute_diff': 36.22, 'max_absolute_diff': 676, 'worst_mismatches_top20': [{'category_id': 304, 'category_name': 'EVERGOOD CLASSIC KOKMALT 250G', 'product_code': '7040913336691', 'product_name': 'EVERGOOD CLASSIC KOKMALT 250G', 'coco_annotation_count': 147, 'metadata_annotation_count': 823, 'corrected_count': 155, 'absolute_diff': 676}, {'category_id': 100, 'category_name': 'EVERGOOD CLASSIC FILTERMALT 250G', 'product_code': '7040913336684', 'product_name': 'EVERGOOD CLASSIC FILTERMALT 250G', 'coco_annotation_count': 368, 'metadata_annotation_count': 106, 'corrected_count': 106, 'absolute_diff': 262}, {'category_id': 86, 'category_name': 'HAVRE KNEKKEBRØD 300G WASA', 'product_code': '7300400130288', 'product_name': 'HAVRE KNEKKEBRØD 300G WASA', 'coco_annotation_count': 398, 'metadata_annotation_count': 606, 'corrected_count': 67, 'absolute_diff': 208}, {'category_id': 300, 'category_name': '', 'product_code': '7035620045349', 'product_name': '', 'coco_annotation_count': 1, 'metadata_annotation_count': 204, 'corrected_count': 47, 'absolute_diff': 203}, {'category_id': 349, 'category_name': 'KNEKKEBRØD SPORT+ 210G WASA', 'product_code': '7300400482950', 'product_name': 'KNEKKEBRØD SPORT+ 210G WASA', 'coco_annotation_count': 364, 'metadata_annotation_count': 550, 'corrected_count': 20, 'absolute_diff': 186}, {'category_id': 271, 'category_name': 'FRUKOST KNEKKEBRØD 240G WASA', 'product_code': '7300400248204', 'product_name': 'FRUKOST KNEKKEBRØD 240G WASA', 'coco_annotation_count': 307, 'metadata_annotation_count': 490, 'corrected_count': 21, 'absolute_diff': 183}, {'category_id': 207, 'category_name': 'LEKSANDS KNEKKE FIBERBIT 240G', 'product_code': '7312080005749', 'product_name': 'LEKSANDS KNEKKE FIBERBIT 240G', 'coco_annotation_count': 297, 'metadata_annotation_count': 464, 'corrected_count': 14, 'absolute_diff': 167}, {'category_id': 109, 'category_name': 'KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA', 'product_code': '7300400482165', 'product_name': 'KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA', 'coco_annotation_count': 374, 'metadata_annotation_count': 540, 'corrected_count': 15, 'absolute_diff': 166}, {'category_id': 80, 'category_name': 'FROKOSTEGG FRITTGÅENDE L 12STK PRIOR', 'product_code': '7039610000318', 'product_name': 'FROKOSTEGG FRITTGÅENDE L 12STK PRIOR', 'coco_annotation_count': 243, 'metadata_annotation_count': 407, 'corrected_count': 28, 'absolute_diff': 164}, {'category_id': 307, 'category_name': 'MAISKAKER OST 125G FRIGGS', 'product_code': '7350028546879', 'product_name': 'MAISKAKER OST 125G FRIGGS', 'coco_annotation_count': 283, 'metadata_annotation_count': 443, 'corrected_count': 35, 'absolute_diff': 160}, {'category_id': 296, 'category_name': 'FIBER BALANCE 230G WASA', 'product_code': '7300400127004', 'product_name': 'FIBER BALANCE 230G WASA', 'coco_annotation_count': 309, 'metadata_annotation_count': 468, 'corrected_count': 58, 'absolute_diff': 159}, {'category_id': 275, 'category_name': 'EGG FRITTGÅENDE 18STK S/M FIRST PRICE', 'product_code': '7035620053573', 'product_name': 'EGG FRITTGÅENDE 18STK S/M FIRST PRICE', 'coco_annotation_count': 223, 'metadata_annotation_count': 381, 'corrected_count': 116, 'absolute_diff': 158}, {'category_id': 233, 'category_name': 'LEKSANDS KNEKKE GODT STEKT 200G', 'product_code': '7312080004025', 'product_name': 'LEKSANDS KNEKKE GODT STEKT 200G', 'coco_annotation_count': 260, 'metadata_annotation_count': 415, 'corrected_count': 36, 'absolute_diff': 155}, {'category_id': 280, 'category_name': 'RISKAKER 100G FIRST PRICE', 'product_code': '7311041019689', 'product_name': 'RISKAKER 100G FIRST PRICE', 'coco_annotation_count': 262, 'metadata_annotation_count': 114, 'corrected_count': 7, 'absolute_diff': 148}, {'category_id': 38, 'category_name': 'KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W', 'product_code': '7300400482691', 'product_name': 'KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W', 'coco_annotation_count': 265, 'metadata_annotation_count': 412, 'corrected_count': 26, 'absolute_diff': 147}, {'category_id': 347, 'category_name': 'EVERGOOD DARK ROAST PRESSMALT 250G', 'product_code': '7040913336806', 'product_name': 'EVERGOOD DARK ROAST PRESSMALT 250G', 'coco_annotation_count': 53, 'metadata_annotation_count': 200, 'corrected_count': 42, 'absolute_diff': 147}, {'category_id': 246, 'category_name': 'HUSMAN KNEKKEBRØD 260G WASA', 'product_code': '7300400118415', 'product_name': 'HUSMAN KNEKKEBRØD 260G WASA', 'coco_annotation_count': 322, 'metadata_annotation_count': 467, 'corrected_count': 35, 'absolute_diff': 145}, {'category_id': 132, 'category_name': 'FRUKOST FULLKORN 320G WASA', 'product_code': '7300400120715', 'product_name': 'FRUKOST FULLKORN 320G WASA', 'coco_annotation_count': 300, 'metadata_annotation_count': 440, 'corrected_count': 23, 'absolute_diff': 140}, {'category_id': 250, 'category_name': 'LEKSANDS KNEKKE NORMALT STEKT 200G', 'product_code': '7312080004018', 'product_name': 'LEKSANDS KNEKKE NORMALT STEKT 200G', 'coco_annotation_count': 271, 'metadata_annotation_count': 411, 'corrected_count': 42, 'absolute_diff': 140}, {'category_id': 21, 'category_name': 'KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA', 'product_code': '7300400129459', 'product_name': 'KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA', 'coco_annotation_count': 271, 'metadata_annotation_count': 407, 'corrected_count': 44, 'absolute_diff': 136}]}`

Unmatched categories sample:
- `4` Økologiske Egg 6stk (10 anns)
- `6` Eldorado Økologiske Gårdsegg (46 anns)
- `10` Jacobs 10 Gårdsegg (12 anns)
- `12` Leksands Rutbit (150 anns)
- `30` SJOKORINGER 375G ELDORADO (129 anns)
- `36` MÜSLI FRUKT MÜSLI 700G AXA (14 anns)
- `51` Tørresvik Gårdsegg 6stk (5 anns)
- `127` FRIELE FROKOST HEL 500G (9 anns)
- `129` SVARTHAVREGRYN LETTKOKTE 900G DEN SORTE (6 anns)
- `138` Økologiske Egg 10stk (14 anns)
- `141` EVERGOOD CLASSIC PRESSMALT 250G (63 anns)
- `144` FRIELE FROKOST KOKMALT 250G (19 anns)
- `150` Sætre GullBar (17 anns)
- `153` FRIELE FROKOST KOFFEINFRI FILTERMALT 250G (1 anns)
- `155` MELANGE FLYTENDE MARGARIN M/SMØR 500ML (3 anns)
- `159` Galåvolden Store Gårdsegg 10stk (4 anns)
- `163` Galåvolden Store Gårdsegg 6stk (6 anns)
- `182` FRIELE INSTANT 200G (13 anns)
- `185` Eldorado Flytende Gårdsegg (28 anns)
- `195` Økologiske Egg Brune 6stk (10 anns)

Unmatched products sample:
- `7037150222009` FRIELE FROKOST PRESSKANNE 250G (2 metadata anns)
