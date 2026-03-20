# NorgesGruppen Deep Audit

This report is derived from the extracted payload plus local zip/hash verification.

## Verification Status

- COCO zip SHA256 matches `SHA256SUMS`: `True`
- Product-images zip SHA256 matches `SHA256SUMS`: `True`
- COCO zip entries: `251` total / `249` files
- Product-images zip entries: `1944` total / `1600` files

## README Claims vs Verified Payload

- README claims `254` shelf images; verified payload has `248`.
- README claims about `22,300` annotations; verified payload has `22731`.
- README claims `357` categories with max id `356`; verified payload has `356` categories with max id `355`.
- README uses submission category range `0-356` and YOLO `nc=357`; payload actually uses ids `0..355`.
- README says `327` product-image products; metadata actually has `329` products, `327` with images, `2` without.
- Disk actually contains `344` product dirs because `17` extra `CUSTOM_*` dirs are present in the archive.

## COCO Validation

- All referenced image files present: `True`
- No extra shelf images beyond annotations: `True`
- No shelf decode failures: `True`
- No shelf dimension mismatches vs `annotations.json`: `True`
- No bad image/category refs: `True`
- No negative/out-of-bounds/area-mismatched boxes: `True`
- Image id range / missing ids: `1..382` with `134` missing positions across `86` gaps
- `iscrowd` values: `{0: 22731}`
- Exact duplicate annotations: `0`

## COCO Shape

- Orientation counts: `{'landscape': 146, 'portrait': 101, 'square': 1}`
- File extensions: `{'.jpeg': 38, '.jpg': 210}`
- Codecs: `{'mjpeg': 248}`
- Empty category names: `[{'id': 300, 'name': ''}]`
- Suspicious category names: `[{'id': 1, 'name': 'COFFEE MATE 180G  NESTLE'}, {'id': 38, 'name': 'KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W'}, {'id': 263, 'name': 'GRANOLA RASPBERRY  500G START!'}, {'id': 300, 'name': ''}, {'id': 308, 'name': 'HAVREGRANOLA  JORDBÆR&BRINGEBÆR 400G URK'}, {'id': 335, 'name': 'STORFE SHORT RIBS GREATER OMAHA LV'}]`
- Annotations/image: `{'min': 14, 'p01': 27.94, 'p05': 34.0, 'p25': 59.0, 'median': 84.0, 'mean': 91.657258, 'p75': 115.25, 'p95': 164.6, 'p99': 203.83, 'max': 235}`
- Distinct categories/image: `{'min': 3, 'p01': 7.0, 'p05': 10.0, 'p25': 25.0, 'median': 36.0, 'mean': 34.475806, 'p75': 44.0, 'p95': 55.65, 'p99': 75.0, 'max': 78}`
- Distinct images/category: `{'min': 1, 'p01': 1.0, 'p05': 1.0, 'p25': 3.0, 'median': 13.0, 'mean': 24.016854, 'p75': 37.0, 'p95': 77.0, 'p99': 86.0, 'max': 90}`
- Image class entropy: `{'min': 1.034601, 'p01': 1.675267, 'p05': 2.112087, 'p25': 3.109681, 'median': 3.466786, 'mean': 3.295355, 'p75': 3.655032, 'p95': 3.832363, 'p99': 4.026115, 'max': 4.060229}`
- Image top-class fraction: `{'min': 0.039216, 'p01': 0.040783, 'p05': 0.047888, 'p25': 0.058701, 'median': 0.072727, 'mean': 0.094335, 'p75': 0.102785, 'p95': 0.220726, 'p99': 0.37686, 'max': 0.5}`
- BBox aspect ratio: `{'min': 0.046099, 'p01': 0.353125, 'p05': 0.48632, 'p25': 0.673729, 'median': 0.877778, 'mean': 1.122283, 'p75': 1.258621, 'p95': 2.668196, 'p99': 4.0, 'max': 14.0}`
- Relative bbox width: `{'min': 0.003224, 'p01': 0.015625, 'p05': 0.024156, 'p25': 0.038498, 'median': 0.054067, 'mean': 0.067393, 'p75': 0.08031, 'p95': 0.159681, 'p99': 0.236535, 'max': 0.452229}`
- Relative bbox height: `{'min': 0.003125, 'p01': 0.02381, 'p05': 0.033069, 'p25': 0.049089, 'median': 0.066667, 'mean': 0.075211, 'p75': 0.094246, 'p95': 0.145783, 'p99': 0.186456, 'max': 0.277344}`
- BBox area fraction of image: `{'min': 1.8e-05, 'p01': 0.000487, 'p05': 0.001002, 'p25': 0.002132, 'median': 0.003743, 'mean': 0.005489, 'p75': 0.006987, 'p95': 0.01573, 'p99': 0.025856, 'max': 0.059236}`
- Per-image labeled area fraction: `{'min': 0.152796, 'p01': 0.208953, 'p05': 0.245072, 'p25': 0.374951, 'median': 0.4880105, 'mean': 0.503065, 'p75': 0.635433, 'p95': 0.787866, 'p99': 0.83582, 'max': 0.883961}`
- Long tail counts: `{'classes_le_5': 84, 'classes_le_10': 115, 'classes_le_25': 175}`
- Long tail annotation mass: `{'annotations_in_classes_le_5': 186, 'annotations_in_classes_le_10': 426, 'annotations_in_classes_le_25': 1444}`
- Annotation concentration: `{'gini': 0.622668, 'class_entropy': 5.19543, 'effective_number_of_classes': 180.445648, 'top_1_annotation_mass_fraction': 0.018565, 'top_5_annotation_mass_fraction': 0.08473, 'top_10_annotation_mass_fraction': 0.152259, 'top_20_annotation_mass_fraction': 0.266156, 'top_50_annotation_mass_fraction': 0.504773, 'top_100_annotation_mass_fraction': 0.757248, 'bottom_half_annotation_mass_fraction': 0.067089}`
- Edge-touch summary: zero-edge `704`, within-1pct `1373` / `22731` = `0.060402`
- Overlap summary: `19574` overlapping pairs out of `1245739` total; IoU>=0.5 pairs `18`, cross-category `5`
- Center heatmap 5x5: `[[426, 581, 653, 551, 346], [778, 1100, 1112, 1118, 814], [811, 1421, 1548, 1558, 1077], [763, 1357, 1454, 1536, 935], [411, 695, 701, 616, 369]]`

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
- `307` MAISKAKER OST 125G FRIGGS (283)
- `21` KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA (271)
- `250` LEKSANDS KNEKKE NORMALT STEKT 200G (271)
- `38` KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W (265)
- `280` RISKAKER 100G FIRST PRICE (262)

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
- `115` EXCELSO COLOMBIA HELE BØNNER 500G JACOBS (1)
- `116` FROKOSTBLANDING LION 350G NESTLE (1)
- `123` ASPARGES GRØNN (1)
- `135` GÅRDSEGG EKSTRA STORE 6STK EK (1)
- `140` SURDEIGKJEKS 100G SÆTRES BESTE (1)

Most diverse images by distinct categories:
- image `6` img_00006.jpg (78 classes, 177 anns, entropy `4.052852`)
- image `17` img_00017.jpg (77 classes, 160 anns, entropy `4.060229`)
- image `18` img_00018.jpg (75 classes, 198 anns, entropy `4.013666`)
- image `14` img_00014.jpg (75 classes, 191 anns, entropy `3.982319`)
- image `66` img_00066.jpg (70 classes, 209 anns, entropy `4.037154`)
- image `60` img_00060.jpg (62 classes, 106 anns, entropy `4.008618`)
- image `55` img_00055.jpeg (60 classes, 97 anns, entropy `3.921694`)
- image `15` img_00015.jpg (58 classes, 118 anns, entropy `3.905083`)
- image `247` img_00247.jpg (57 classes, 143 anns, entropy `3.900059`)
- image `33` img_00033.jpeg (56 classes, 161 anns, entropy `3.520481`)

Highest-IoU cross-category pairs (potential label conflicts):
- image `261` IoU `0.88022`: KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA || HUSMAN KNEKKEBRØD 260G WASA
- image `251` IoU `0.868957`: LEKSANDS KNEKKE RUTBIT 200G || Leksands Rutbit
- image `261` IoU `0.834532`: HUSMAN KNEKKEBRØD 260G WASA || FRUKOST KNEKKEBRØD 240G WASA
- image `256` IoU `0.749973`: FRUKOST FULLKORN 320G WASA || FRUKOST KNEKKEBRØD 240G WASA
- image `261` IoU `0.691801`: KNEKKS KJEKS M/SPELT&HAVSALT 190G RØROS || FRUKOST KNEKKEBRØD 240G WASA

## Packshot Validation

- No packshot decode failures: `True`
- No metadata-vs-disk image-type mismatches: `True`
- Metadata-only codes (missing dirs): `['7310390855122', '8032529645341']`
- Disk-only dirs: `['CUSTOM_001', 'CUSTOM_002', 'CUSTOM_003', 'CUSTOM_004', 'CUSTOM_005', 'CUSTOM_006', 'CUSTOM_007', 'CUSTOM_008', 'CUSTOM_009', 'CUSTOM_010', 'CUSTOM_011', 'CUSTOM_012', 'CUSTOM_013', 'CUSTOM_014', 'CUSTOM_015', 'CUSTOM_016', 'CUSTOM_017']`
- Top missing-type patterns: `[{'missing_types': ['top', 'bottom'], 'count': 122}, {'missing_types': ['bottom'], 'count': 81}, {'missing_types': [], 'count': 30}, {'missing_types': ['back', 'left', 'right', 'top', 'bottom'], 'count': 30}, {'missing_types': ['front', 'back', 'left', 'right', 'top', 'bottom'], 'count': 28}, {'missing_types': ['back', 'right', 'bottom'], 'count': 23}, {'missing_types': ['left', 'right', 'top', 'bottom'], 'count': 15}, {'missing_types': ['right', 'bottom'], 'count': 3}]`
- Barcode validity in metadata: `{'valid_gtin_13': 312, 'valid_upc11_via_leading_zero': 13, 'valid_gtin_12': 2, 'valid_gtin_8': 1, 'invalid_len_4': 1}`
- Invalid metadata barcode rows: `[{'product_code': '4521', 'product_name': 'ASPARGES GRØNN', 'annotation_count': 1, 'image_types': ['main']}]`
- Metadata annotation_count sum: `32666`
- Metadata corrected_count sum: `4272`
- Product-image duplicates by exact bytes: `43` groups
- Per-product duplicate groups: `43`
- Cross-product exact duplicate groups: `0`
- Normalized-name collisions in metadata: `[{'normalized_name': 'RISKAKER 100G FIRST PRICE', 'product_count': 2, 'annotation_count_sum': 398, 'products': [{'product_code': '7035620059841', 'product_name': 'RISKAKER 100G FIRST PRICE', 'annotation_count': 284, 'corrected_count': 13, 'has_images': True, 'image_types': ['front', 'main']}, {'product_code': '7311041019689', 'product_name': 'RISKAKER 100G FIRST PRICE', 'annotation_count': 114, 'corrected_count': 7, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right', 'top']}]}, {'normalized_name': '', 'product_count': 5, 'annotation_count_sum': 242, 'products': [{'product_code': '7035620045349', 'product_name': '', 'annotation_count': 204, 'corrected_count': 47, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right']}, {'product_code': '7037159627003', 'product_name': '', 'annotation_count': 14, 'corrected_count': 6, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right', 'top']}, {'product_code': '5010029201246', 'product_name': '', 'annotation_count': 12, 'corrected_count': 6, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right', 'top']}, {'product_code': '7044416017484', 'product_name': '', 'annotation_count': 11, 'corrected_count': 4, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right']}, {'product_code': '7041110121738', 'product_name': '', 'annotation_count': 1, 'corrected_count': 0, 'has_images': True, 'image_types': ['front', 'main']}]}]`
- Normal representative aspect ratio: `{'min': 0.265957, 'p01': 0.397074, 'p05': 0.446809, 'p25': 0.56649, 'median': 0.739362, 'mean': 0.91978, 'p75': 1.05175, 'p95': 1.840113, 'p99': 2.611111, 'max': 2.764706}`
- CUSTOM representative aspect ratio: `{'min': 0.578667, 'p01': 0.655926, 'p05': 0.964964, 'p25': 1.934211, 'median': 2.593023, 'mean': 2.440995, 'p75': 3.277778, 'p95': 3.503429, 'p99': 3.611964, 'max': 3.639098}`
- Normal nearest-neighbor aHash distance: `{'min': 0, 'p01': 0.0, 'p05': 2.0, 'p25': 6.0, 'median': 9, 'mean': 9.275229, 'p75': 13.0, 'p95': 17.0, 'p99': 20.0, 'max': 21}`
- CUSTOM->normal nearest-neighbor aHash distance: `{'min': 6, 'p01': 6.48, 'p05': 8.4, 'p25': 12.0, 'median': 15, 'mean': 15.294118, 'p75': 20.0, 'p95': 21.2, 'p99': 21.84, 'max': 22}`

Closest CUSTOM dirs to normal representatives:
- `CUSTOM_001` -> `7071848106448` at distance `6`
- `CUSTOM_004` -> `7311041013472` at distance `9`
- `CUSTOM_003` -> `7056831970015` at distance `10`
- `CUSTOM_007` -> `7311041013472` at distance `12`
- `CUSTOM_008` -> `7311041013472` at distance `12`
- `CUSTOM_015` -> `7044416017453` at distance `13`
- `CUSTOM_002` -> `7311041013472` at distance `14`
- `CUSTOM_011` -> `7071319021751` at distance `14`
- `CUSTOM_014` -> `7311041013472` at distance `15`
- `CUSTOM_009` -> `7300400126168` at distance `16`

## Cross-Dataset Alignment

- Matched categories by normalized product name: `323` / `356`
- Annotation mass by match status: `{'matched_with_images_unique': 21218, 'no_match': 1195, 'matched_no_images_unique': 55, 'matched_with_images_ambiguous': 263}`
- Annotation mass by packshot view count: `{1: 619, 2: 1366, 3: 201, 4: 1430, 5: 9654, 6: 6317, 7: 1631}`
- Theme packshot readiness: `{'egg': {'annotation_total': 1398, 'exact_unique_with_images_annotation_count': 1176, 'exact_unique_with_images_fraction': 0.841202, 'ambiguous_exact_name_annotation_count': 0, 'ambiguous_exact_name_fraction': 0.0, 'matched_but_no_image_annotation_count': 0, 'matched_but_no_image_fraction': 0.0, 'close_unmatched_annotation_count': 0, 'close_unmatched_fraction': 0.0, 'hard_unmatched_annotation_count': 222, 'hard_unmatched_fraction': 0.158798, 'low_view_exact_annotation_count': 573, 'low_view_exact_fraction_of_exact': 0.487245, 'exact_unique_category_count': 12, 'low_view_exact_category_count': 6}, 'frokost': {'annotation_total': 5889, 'exact_unique_with_images_annotation_count': 5863, 'exact_unique_with_images_fraction': 0.995585, 'ambiguous_exact_name_annotation_count': 0, 'ambiguous_exact_name_fraction': 0.0, 'matched_but_no_image_annotation_count': 0, 'matched_but_no_image_fraction': 0.0, 'close_unmatched_annotation_count': 14, 'close_unmatched_fraction': 0.002377, 'hard_unmatched_annotation_count': 12, 'hard_unmatched_fraction': 0.002038, 'low_view_exact_annotation_count': 849, 'low_view_exact_fraction_of_exact': 0.144806, 'exact_unique_category_count': 60, 'low_view_exact_category_count': 9}, 'knekkebrod': {'annotation_total': 8689, 'exact_unique_with_images_annotation_count': 8277, 'exact_unique_with_images_fraction': 0.952584, 'ambiguous_exact_name_annotation_count': 262, 'ambiguous_exact_name_fraction': 0.030153, 'matched_but_no_image_annotation_count': 0, 'matched_but_no_image_fraction': 0.0, 'close_unmatched_annotation_count': 0, 'close_unmatched_fraction': 0.0, 'hard_unmatched_annotation_count': 150, 'hard_unmatched_fraction': 0.017263, 'low_view_exact_annotation_count': 160, 'low_view_exact_fraction_of_exact': 0.019331, 'exact_unique_category_count': 59, 'low_view_exact_category_count': 7}, 'other': {'annotation_total': 1311, 'exact_unique_with_images_annotation_count': 735, 'exact_unique_with_images_fraction': 0.560641, 'ambiguous_exact_name_annotation_count': 1, 'ambiguous_exact_name_fraction': 0.000763, 'matched_but_no_image_annotation_count': 1, 'matched_but_no_image_fraction': 0.000763, 'close_unmatched_annotation_count': 0, 'close_unmatched_fraction': 0.0, 'hard_unmatched_annotation_count': 574, 'hard_unmatched_fraction': 0.437834, 'low_view_exact_annotation_count': 12, 'low_view_exact_fraction_of_exact': 0.016327, 'exact_unique_category_count': 58, 'low_view_exact_category_count': 4}, 'varmedrikker': {'annotation_total': 5444, 'exact_unique_with_images_annotation_count': 5167, 'exact_unique_with_images_fraction': 0.949118, 'ambiguous_exact_name_annotation_count': 0, 'ambiguous_exact_name_fraction': 0.0, 'matched_but_no_image_annotation_count': 54, 'matched_but_no_image_fraction': 0.009919, 'close_unmatched_annotation_count': 168, 'close_unmatched_fraction': 0.03086, 'hard_unmatched_annotation_count': 55, 'hard_unmatched_fraction': 0.010103, 'low_view_exact_annotation_count': 391, 'low_view_exact_fraction_of_exact': 0.075673, 'exact_unique_category_count': 130, 'low_view_exact_category_count': 13}}`
- Exact-match annotation mass by theme: `{'knekkebrod': 8277, 'varmedrikker': 5167, 'frokost': 5863, 'other': 735, 'egg': 1176}`
- Close unmatched annotation mass by theme: `{'frokost': 14, 'varmedrikker': 168}`
- Hard unmatched annotation mass by theme: `{'egg': 222, 'varmedrikker': 55, 'knekkebrod': 150, 'other': 574, 'frokost': 12}`
- Close unmatched annotation mass: `182`
- Hard unmatched annotation mass: `1013`
- Ambiguous normalized-name matches: `[{'category_id': 280, 'category_name': 'RISKAKER 100G FIRST PRICE', 'annotation_count': 262, 'products': [{'product_code': '7035620059841', 'product_name': 'RISKAKER 100G FIRST PRICE', 'annotation_count': 284, 'corrected_count': 13, 'has_images': True, 'image_types': ['front', 'main']}, {'product_code': '7311041019689', 'product_name': 'RISKAKER 100G FIRST PRICE', 'annotation_count': 114, 'corrected_count': 7, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right', 'top']}]}, {'category_id': 300, 'category_name': '', 'annotation_count': 1, 'products': [{'product_code': '7035620045349', 'product_name': '', 'annotation_count': 204, 'corrected_count': 47, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right']}, {'product_code': '7037159627003', 'product_name': '', 'annotation_count': 14, 'corrected_count': 6, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right', 'top']}, {'product_code': '5010029201246', 'product_name': '', 'annotation_count': 12, 'corrected_count': 6, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right', 'top']}, {'product_code': '7044416017484', 'product_name': '', 'annotation_count': 11, 'corrected_count': 4, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right']}, {'product_code': '7041110121738', 'product_name': '', 'annotation_count': 1, 'corrected_count': 0, 'has_images': True, 'image_types': ['front', 'main']}]}]`
- Count alignment summary: `{'metadata_gt_coco': 237, 'metadata_eq_coco': 77, 'metadata_lt_coco': 14, 'corrected_gt_coco': 8, 'corrected_eq_coco': 21, 'corrected_lt_coco': 299, 'unique_match_count': 321, 'metadata_vs_coco_pearson_unique': 0.938562, 'corrected_vs_coco_pearson_unique': 0.617527, 'metadata_over_coco_ratio_summary_unique': {'min': 0.28804347826086957, 'p01': 0.413043, 'p05': 1.0, 'p25': 1.0, 'median': 1.4406779661016949, 'mean': 1.404721, 'p75': 1.542857, 'p95': 1.857143, 'p99': 3.564211, 'max': 9.0}, 'corrected_over_coco_ratio_summary_unique': {'min': 0.0, 'p01': 0.0, 'p05': 0.0, 'p25': 0.065789, 'median': 0.1724137931034483, 'mean': 0.28861, 'p75': 0.375, 'p95': 1.0, 'p99': 1.043537, 'max': 5.333333333333333}, 'mae_metadata_vs_coco_unique': 35.741433, 'mae_corrected_vs_coco_unique': 53.457944, 'mae_metadata_minus_corrected_vs_coco_unique': 25.844237, 'worst_metadata_mismatches_top20': [{'category_id': 304, 'category_name': 'EVERGOOD CLASSIC KOKMALT 250G', 'product_code': '7040913336691', 'product_name': 'EVERGOOD CLASSIC KOKMALT 250G', 'coco_annotation_count': 147, 'metadata_annotation_count': 823, 'corrected_count': 155, 'absolute_diff_metadata': 676, 'absolute_diff_corrected': 8}, {'category_id': 100, 'category_name': 'EVERGOOD CLASSIC FILTERMALT 250G', 'product_code': '7040913336684', 'product_name': 'EVERGOOD CLASSIC FILTERMALT 250G', 'coco_annotation_count': 368, 'metadata_annotation_count': 106, 'corrected_count': 106, 'absolute_diff_metadata': 262, 'absolute_diff_corrected': 262}, {'category_id': 86, 'category_name': 'HAVRE KNEKKEBRØD 300G WASA', 'product_code': '7300400130288', 'product_name': 'HAVRE KNEKKEBRØD 300G WASA', 'coco_annotation_count': 398, 'metadata_annotation_count': 606, 'corrected_count': 67, 'absolute_diff_metadata': 208, 'absolute_diff_corrected': 331}, {'category_id': 300, 'category_name': '', 'product_code': '7035620045349', 'product_name': '', 'coco_annotation_count': 1, 'metadata_annotation_count': 204, 'corrected_count': 47, 'absolute_diff_metadata': 203, 'absolute_diff_corrected': 46}, {'category_id': 349, 'category_name': 'KNEKKEBRØD SPORT+ 210G WASA', 'product_code': '7300400482950', 'product_name': 'KNEKKEBRØD SPORT+ 210G WASA', 'coco_annotation_count': 364, 'metadata_annotation_count': 550, 'corrected_count': 20, 'absolute_diff_metadata': 186, 'absolute_diff_corrected': 344}, {'category_id': 271, 'category_name': 'FRUKOST KNEKKEBRØD 240G WASA', 'product_code': '7300400248204', 'product_name': 'FRUKOST KNEKKEBRØD 240G WASA', 'coco_annotation_count': 307, 'metadata_annotation_count': 490, 'corrected_count': 21, 'absolute_diff_metadata': 183, 'absolute_diff_corrected': 286}, {'category_id': 207, 'category_name': 'LEKSANDS KNEKKE FIBERBIT 240G', 'product_code': '7312080005749', 'product_name': 'LEKSANDS KNEKKE FIBERBIT 240G', 'coco_annotation_count': 297, 'metadata_annotation_count': 464, 'corrected_count': 14, 'absolute_diff_metadata': 167, 'absolute_diff_corrected': 283}, {'category_id': 109, 'category_name': 'KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA', 'product_code': '7300400482165', 'product_name': 'KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA', 'coco_annotation_count': 374, 'metadata_annotation_count': 540, 'corrected_count': 15, 'absolute_diff_metadata': 166, 'absolute_diff_corrected': 359}, {'category_id': 80, 'category_name': 'FROKOSTEGG FRITTGÅENDE L 12STK PRIOR', 'product_code': '7039610000318', 'product_name': 'FROKOSTEGG FRITTGÅENDE L 12STK PRIOR', 'coco_annotation_count': 243, 'metadata_annotation_count': 407, 'corrected_count': 28, 'absolute_diff_metadata': 164, 'absolute_diff_corrected': 215}, {'category_id': 307, 'category_name': 'MAISKAKER OST 125G FRIGGS', 'product_code': '7350028546879', 'product_name': 'MAISKAKER OST 125G FRIGGS', 'coco_annotation_count': 283, 'metadata_annotation_count': 443, 'corrected_count': 35, 'absolute_diff_metadata': 160, 'absolute_diff_corrected': 248}, {'category_id': 296, 'category_name': 'FIBER BALANCE 230G WASA', 'product_code': '7300400127004', 'product_name': 'FIBER BALANCE 230G WASA', 'coco_annotation_count': 309, 'metadata_annotation_count': 468, 'corrected_count': 58, 'absolute_diff_metadata': 159, 'absolute_diff_corrected': 251}, {'category_id': 275, 'category_name': 'EGG FRITTGÅENDE 18STK S/M FIRST PRICE', 'product_code': '7035620053573', 'product_name': 'EGG FRITTGÅENDE 18STK S/M FIRST PRICE', 'coco_annotation_count': 223, 'metadata_annotation_count': 381, 'corrected_count': 116, 'absolute_diff_metadata': 158, 'absolute_diff_corrected': 107}, {'category_id': 233, 'category_name': 'LEKSANDS KNEKKE GODT STEKT 200G', 'product_code': '7312080004025', 'product_name': 'LEKSANDS KNEKKE GODT STEKT 200G', 'coco_annotation_count': 260, 'metadata_annotation_count': 415, 'corrected_count': 36, 'absolute_diff_metadata': 155, 'absolute_diff_corrected': 224}, {'category_id': 280, 'category_name': 'RISKAKER 100G FIRST PRICE', 'product_code': '7311041019689', 'product_name': 'RISKAKER 100G FIRST PRICE', 'coco_annotation_count': 262, 'metadata_annotation_count': 114, 'corrected_count': 7, 'absolute_diff_metadata': 148, 'absolute_diff_corrected': 255}, {'category_id': 38, 'category_name': 'KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W', 'product_code': '7300400482691', 'product_name': 'KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W', 'coco_annotation_count': 265, 'metadata_annotation_count': 412, 'corrected_count': 26, 'absolute_diff_metadata': 147, 'absolute_diff_corrected': 239}, {'category_id': 347, 'category_name': 'EVERGOOD DARK ROAST PRESSMALT 250G', 'product_code': '7040913336806', 'product_name': 'EVERGOOD DARK ROAST PRESSMALT 250G', 'coco_annotation_count': 53, 'metadata_annotation_count': 200, 'corrected_count': 42, 'absolute_diff_metadata': 147, 'absolute_diff_corrected': 11}, {'category_id': 246, 'category_name': 'HUSMAN KNEKKEBRØD 260G WASA', 'product_code': '7300400118415', 'product_name': 'HUSMAN KNEKKEBRØD 260G WASA', 'coco_annotation_count': 322, 'metadata_annotation_count': 467, 'corrected_count': 35, 'absolute_diff_metadata': 145, 'absolute_diff_corrected': 287}, {'category_id': 132, 'category_name': 'FRUKOST FULLKORN 320G WASA', 'product_code': '7300400120715', 'product_name': 'FRUKOST FULLKORN 320G WASA', 'coco_annotation_count': 300, 'metadata_annotation_count': 440, 'corrected_count': 23, 'absolute_diff_metadata': 140, 'absolute_diff_corrected': 277}, {'category_id': 250, 'category_name': 'LEKSANDS KNEKKE NORMALT STEKT 200G', 'product_code': '7312080004018', 'product_name': 'LEKSANDS KNEKKE NORMALT STEKT 200G', 'coco_annotation_count': 271, 'metadata_annotation_count': 411, 'corrected_count': 42, 'absolute_diff_metadata': 140, 'absolute_diff_corrected': 229}, {'category_id': 21, 'category_name': 'KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA', 'product_code': '7300400129459', 'product_name': 'KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA', 'coco_annotation_count': 271, 'metadata_annotation_count': 407, 'corrected_count': 44, 'absolute_diff_metadata': 136, 'absolute_diff_corrected': 227}], 'corrected_gt_coco_rows': [{'category_id': 300, 'category_name': '', 'product_code': '7035620045349', 'product_name': '', 'coco_annotation_count': 1, 'metadata_annotation_count': 204, 'corrected_count': 47, 'absolute_diff_metadata': 203, 'absolute_diff_corrected': 46}, {'category_id': 104, 'category_name': 'SMØR USALTET 250G TINE', 'product_code': '7038010011702', 'product_name': 'SMØR USALTET 250G TINE', 'coco_annotation_count': 3, 'metadata_annotation_count': 27, 'corrected_count': 16, 'absolute_diff_metadata': 24, 'absolute_diff_corrected': 13}, {'category_id': 106, 'category_name': 'NESCAFE GOLD KOFFEINFRI 100G', 'product_code': '7613287111180', 'product_name': 'NESCAFE GOLD KOFFEINFRI 100G', 'coco_annotation_count': 34, 'metadata_annotation_count': 65, 'corrected_count': 44, 'absolute_diff_metadata': 31, 'absolute_diff_corrected': 10}, {'category_id': 304, 'category_name': 'EVERGOOD CLASSIC KOKMALT 250G', 'product_code': '7040913336691', 'product_name': 'EVERGOOD CLASSIC KOKMALT 250G', 'coco_annotation_count': 147, 'metadata_annotation_count': 823, 'corrected_count': 155, 'absolute_diff_metadata': 676, 'absolute_diff_corrected': 8}, {'category_id': 344, 'category_name': 'EVERGOOD DARK ROAST KAFFEKAPSEL 16STK', 'product_code': '7040913337452', 'product_name': 'EVERGOOD DARK ROAST KAFFEKAPSEL 16STK', 'coco_annotation_count': 33, 'metadata_annotation_count': 48, 'corrected_count': 39, 'absolute_diff_metadata': 15, 'absolute_diff_corrected': 6}, {'category_id': 300, 'category_name': '', 'product_code': '7037159627003', 'product_name': '', 'coco_annotation_count': 1, 'metadata_annotation_count': 14, 'corrected_count': 6, 'absolute_diff_metadata': 13, 'absolute_diff_corrected': 5}, {'category_id': 300, 'category_name': '', 'product_code': '5010029201246', 'product_name': '', 'coco_annotation_count': 1, 'metadata_annotation_count': 12, 'corrected_count': 6, 'absolute_diff_metadata': 11, 'absolute_diff_corrected': 5}, {'category_id': 300, 'category_name': '', 'product_code': '7044416017484', 'product_name': '', 'coco_annotation_count': 1, 'metadata_annotation_count': 11, 'corrected_count': 4, 'absolute_diff_metadata': 10, 'absolute_diff_corrected': 3}]}`
- Close unmatched categories (`ratio >= 0.75`): `6`
- Hard unmatched categories (`ratio < 0.75`): `27`
- Unmatched products: `[{'product_code': '7037150222009', 'product_name': 'FRIELE FROKOST PRESSKANNE 250G', 'annotation_count': 2, 'corrected_count': 2, 'has_images': True, 'image_types': ['back', 'front', 'left', 'main', 'right']}]`

Close unmatched categories sample:
- `341` EVERGOOD CLASSIC HELE BØNNER 500G (76 anns, best `EVERGOOD ESPRESSO HELE BØNNER 500G`, ratio `0.836`)
- `141` EVERGOOD CLASSIC PRESSMALT 250G (63 anns, best `EVERGOOD CLASSIC KOKMALT 250G`, ratio `0.867`)
- `144` FRIELE FROKOST KOKMALT 250G (19 anns, best `FRIELE FROKOST FILTERMALT 250G`, ratio `0.842`)
- `36` MÜSLI FRUKT MÜSLI 700G AXA (14 anns, best `MUSLI FRUKT 700G AXA`, ratio `0.826`)
- `127` FRIELE FROKOST HEL 500G (9 anns, best `FRIELE FROKOST FILTERMALT 250G`, ratio `0.792`)
- `153` FRIELE FROKOST KOFFEINFRI FILTERMALT 250G (1 anns, best `FRIELE FROKOST FILTERMALT 250G`, ratio `0.845`)

Hard unmatched categories sample:
- `355` unknown_product (422 anns, best `CAPPUCCINO 8KAPSLER DOLCE GUSTO`, ratio `0.391`)
- `12` Leksands Rutbit (150 anns, best `LEKSANDS KNEKKE RUTBIT 200G`, ratio `0.714`)
- `30` SJOKORINGER 375G ELDORADO (129 anns, best `SJOKOFLAK FROKOSTBLANDING 375G ELDORADO`, ratio `0.719`)
- `6` Eldorado Økologiske Gårdsegg (46 anns, best `FLATBRØD ØKOLOGISK 190G RØROS`, ratio `0.561`)
- `269` Eldorado Egg fra Toten (33 anns, best `GÅRDSEGG EKSTRA STORE 6STK EK`, ratio `0.471`)
- `312` Tørresvik Gård Kvalitetsegg 10stk (33 anns, best `COTW DARK ROAST KAFFEKAPSEL 10STK`, ratio `0.515`)
- `185` Eldorado Flytende Gårdsegg (28 anns, best `MELANGE FLYTENDE 500ML`, ratio `0.542`)
- `348` ALI ORIGINAL HELE BØNNER 250G (24 anns, best `ALI ORIGINAL FILTERMALT 250G`, ratio `0.737`)
- `150` Sætre GullBar (17 anns, best `NESCAFE GULL 100G`, ratio `0.467`)
- `138` Økologiske Egg 10stk (14 anns, best `EGG M/L ØKOLOGISKE 10STK VILJE`, ratio `0.64`)
- `182` FRIELE INSTANT 200G (13 anns, best `FRIELE INSTANT GULL 100G REFILL`, ratio `0.72`)
- `216` Sunnmørsegg (13 anns, best `SMØR USALTET 250G TINE`, ratio `0.424`)
- `10` Jacobs 10 Gårdsegg (12 anns, best `SMACKS 330G KELLOGG'S`, ratio `0.462`)
- `277` ALPEN MÜSLI WEETABIX (12 anns, best `WEETOS CHOCO 375G WEETABIX`, ratio `0.522`)
- `4` Økologiske Egg 6stk (10 anns, best `EGG ØKOLOGISK M/L/XL 6STK PRIOR`, ratio `0.6`)
- `195` Økologiske Egg Brune 6stk (10 anns, best `EGG ØKOLOGISK M/L/XL 6STK PRIOR`, ratio `0.571`)
- `286` EGG L 10STK TOTEN (9 anns, best `EGG M/L ØKOLOGISKE 10STK VILJE`, ratio `0.553`)
- `129` SVARTHAVREGRYN LETTKOKTE 900G DEN SORTE (6 anns, best `SVARTHAVRERIS ØKOLOGISK DEN SORTE HAVRE`, ratio `0.641`)
- `163` Galåvolden Store Gårdsegg 6stk (6 anns, best `ALL-BRAN REGULAR 375G KELLOGG'S`, ratio `0.459`)
- `301` Gårdsegg fra Fana 10stk (6 anns, best `GÅRDSEGG EKSTRA STORE 6STK EK`, ratio `0.615`)

Heuristic unresolved join triage:
- `355` unknown_product (422 anns, triage `non_resolvable_from_name`, best `CAPPUCCINO 8KAPSLER DOLCE GUSTO`, shared `[]`, ratio `0.391`)
- `12` Leksands Rutbit (150 anns, triage `medium_confidence_family_candidate`, best `LEKSANDS KNEKKE RUTBIT 200G`, shared `['LEKSANDS', 'RUTBIT']`, ratio `0.714`)
- `30` SJOKORINGER 375G ELDORADO (129 anns, triage `medium_confidence_family_candidate`, best `SJOKOFLAK FROKOSTBLANDING 375G ELDORADO`, shared `['375G', 'ELDORADO']`, ratio `0.719`)
- `341` EVERGOOD CLASSIC HELE BØNNER 500G (76 anns, triage `high_confidence_text_alias_candidate`, best `EVERGOOD ESPRESSO HELE BØNNER 500G`, shared `['500G', 'BØNNER', 'EVERGOOD', 'HELE']`, ratio `0.836`)
- `141` EVERGOOD CLASSIC PRESSMALT 250G (63 anns, triage `high_confidence_text_alias_candidate`, best `EVERGOOD CLASSIC KOKMALT 250G`, shared `['250G', 'CLASSIC', 'EVERGOOD']`, ratio `0.867`)
- `6` Eldorado Økologiske Gårdsegg (46 anns, triage `likely_missing_reference_or_weak_match`, best `FLATBRØD ØKOLOGISK 190G RØROS`, shared `[]`, ratio `0.561`)
- `269` Eldorado Egg fra Toten (33 anns, triage `likely_missing_reference_or_weak_match`, best `GÅRDSEGG EKSTRA STORE 6STK EK`, shared `[]`, ratio `0.471`)
- `312` Tørresvik Gård Kvalitetsegg 10stk (33 anns, triage `likely_missing_reference_or_weak_match`, best `COTW DARK ROAST KAFFEKAPSEL 10STK`, shared `['10STK']`, ratio `0.515`)
- `185` Eldorado Flytende Gårdsegg (28 anns, triage `likely_missing_reference_or_weak_match`, best `MELANGE FLYTENDE 500ML`, shared `['FLYTENDE']`, ratio `0.542`)
- `348` ALI ORIGINAL HELE BØNNER 250G (24 anns, triage `medium_confidence_family_candidate`, best `ALI ORIGINAL FILTERMALT 250G`, shared `['250G', 'ALI', 'ORIGINAL']`, ratio `0.737`)
- `144` FRIELE FROKOST KOKMALT 250G (19 anns, triage `high_confidence_text_alias_candidate`, best `FRIELE FROKOST FILTERMALT 250G`, shared `['250G', 'FRIELE', 'FROKOST']`, ratio `0.842`)
- `150` Sætre GullBar (17 anns, triage `likely_missing_reference_or_weak_match`, best `NESCAFE GULL 100G`, shared `[]`, ratio `0.467`)
- `36` MÜSLI FRUKT MÜSLI 700G AXA (14 anns, triage `high_confidence_text_alias_candidate`, best `MUSLI FRUKT 700G AXA`, shared `['700G', 'AXA', 'FRUKT']`, ratio `0.826`)
- `138` Økologiske Egg 10stk (14 anns, triage `likely_missing_reference_or_weak_match`, best `EGG M/L ØKOLOGISKE 10STK VILJE`, shared `['10STK', 'EGG', 'ØKOLOGISKE']`, ratio `0.64`)
- `182` FRIELE INSTANT 200G (13 anns, triage `medium_confidence_family_candidate`, best `FRIELE INSTANT GULL 100G REFILL`, shared `['FRIELE', 'INSTANT']`, ratio `0.72`)
- `216` Sunnmørsegg (13 anns, triage `likely_missing_reference_or_weak_match`, best `SMØR USALTET 250G TINE`, shared `[]`, ratio `0.424`)
- `10` Jacobs 10 Gårdsegg (12 anns, triage `likely_missing_reference_or_weak_match`, best `SMACKS 330G KELLOGG'S`, shared `[]`, ratio `0.462`)
- `277` ALPEN MÜSLI WEETABIX (12 anns, triage `likely_missing_reference_or_weak_match`, best `WEETOS CHOCO 375G WEETABIX`, shared `['WEETABIX']`, ratio `0.522`)
- `4` Økologiske Egg 6stk (10 anns, triage `likely_missing_reference_or_weak_match`, best `EGG ØKOLOGISK M/L/XL 6STK PRIOR`, shared `['6STK', 'EGG']`, ratio `0.6`)
- `195` Økologiske Egg Brune 6stk (10 anns, triage `likely_missing_reference_or_weak_match`, best `EGG ØKOLOGISK M/L/XL 6STK PRIOR`, shared `['6STK', 'EGG']`, ratio `0.571`)

## Inferred Shelf Structure

- Themes below are inferred from category-name keywords, not explicit fields in the payload.
- Dominant-theme image counts: `{'varmedrikker': 47, 'other': 6, 'egg': 23, 'frokost': 82, 'knekkebrod': 90}`
- Annotation-theme totals: `{'varmedrikker': 5444, 'other': 1311, 'frokost': 5889, 'knekkebrod': 8689, 'egg': 1398}`
- Best contiguous 4-section segmentation: `{'theme_order': ['varmedrikker', 'egg', 'frokost', 'knekkebrod'], 'score': 19323, 'segments': [{'segment_index': 1, 'theme': 'varmedrikker', 'image_count': 47, 'start_image_id': 1, 'end_image_id': 66, 'purity': 0.952572, 'theme_annotation_counts': {'varmedrikker': 4740, 'egg': 0, 'frokost': 4, 'knekkebrod': 14, 'other': 218}}, {'segment_index': 2, 'theme': 'egg', 'image_count': 29, 'start_image_id': 71, 'end_image_id': 111, 'purity': 0.751613, 'theme_annotation_counts': {'varmedrikker': 82, 'egg': 1398, 'frokost': 0, 'knekkebrod': 0, 'other': 380}}, {'segment_index': 3, 'theme': 'frokost', 'image_count': 82, 'start_image_id': 114, 'end_image_id': 243, 'purity': 0.852919, 'theme_annotation_counts': {'varmedrikker': 485, 'egg': 0, 'frokost': 4558, 'knekkebrod': 48, 'other': 253}}, {'segment_index': 4, 'theme': 'knekkebrod', 'image_count': 90, 'start_image_id': 244, 'end_image_id': 382, 'purity': 0.817648, 'theme_annotation_counts': {'varmedrikker': 137, 'egg': 0, 'frokost': 1327, 'knekkebrod': 8627, 'other': 460}}], 'lowest_consecutive_jaccard_boundaries': [{'left_image_id': 66, 'right_image_id': 71, 'jaccard': 0.0}, {'left_image_id': 111, 'right_image_id': 114, 'jaccard': 0.0}, {'left_image_id': 243, 'right_image_id': 244, 'jaccard': 0.0}, {'left_image_id': 44, 'right_image_id': 46, 'jaccard': 0.039216}, {'left_image_id': 47, 'right_image_id': 48, 'jaccard': 0.043478}, {'left_image_id': 201, 'right_image_id': 205, 'jaccard': 0.057143}, {'left_image_id': 46, 'right_image_id': 47, 'jaccard': 0.066667}, {'left_image_id': 21, 'right_image_id': 22, 'jaccard': 0.068182}, {'left_image_id': 85, 'right_image_id': 86, 'jaccard': 0.1}, {'left_image_id': 242, 'right_image_id': 243, 'jaccard': 0.108108}, {'left_image_id': 86, 'right_image_id': 88, 'jaccard': 0.111111}, {'left_image_id': 25, 'right_image_id': 26, 'jaccard': 0.148148}, {'left_image_id': 77, 'right_image_id': 78, 'jaccard': 0.15}, {'left_image_id': 79, 'right_image_id': 80, 'jaccard': 0.15}, {'left_image_id': 200, 'right_image_id': 201, 'jaccard': 0.157895}, {'left_image_id': 108, 'right_image_id': 109, 'jaccard': 0.166667}, {'left_image_id': 205, 'right_image_id': 206, 'jaccard': 0.177778}, {'left_image_id': 89, 'right_image_id': 93, 'jaccard': 0.181818}, {'left_image_id': 71, 'right_image_id': 72, 'jaccard': 0.185185}, {'left_image_id': 78, 'right_image_id': 79, 'jaccard': 0.190476}, {'left_image_id': 26, 'right_image_id': 27, 'jaccard': 0.192982}, {'left_image_id': 294, 'right_image_id': 295, 'jaccard': 0.19403}, {'left_image_id': 170, 'right_image_id': 173, 'jaccard': 0.205882}, {'left_image_id': 7, 'right_image_id': 9, 'jaccard': 0.213115}, {'left_image_id': 100, 'right_image_id': 102, 'jaccard': 0.214286}]}`
- Longest contiguous theme runs: `[{'start_image_id': 114, 'end_image_id': 122, 'theme': 'frokost', 'length': 9}, {'start_image_id': 31, 'end_image_id': 38, 'theme': 'varmedrikker', 'length': 8}, {'start_image_id': 293, 'end_image_id': 300, 'theme': 'knekkebrod', 'length': 8}, {'start_image_id': 9, 'end_image_id': 15, 'theme': 'varmedrikker', 'length': 7}, {'start_image_id': 17, 'end_image_id': 23, 'theme': 'varmedrikker', 'length': 7}, {'start_image_id': 126, 'end_image_id': 132, 'theme': 'frokost', 'length': 7}, {'start_image_id': 267, 'end_image_id': 273, 'theme': 'knekkebrod', 'length': 7}, {'start_image_id': 72, 'end_image_id': 77, 'theme': 'egg', 'length': 6}, {'start_image_id': 238, 'end_image_id': 243, 'theme': 'frokost', 'length': 6}, {'start_image_id': 244, 'end_image_id': 249, 'theme': 'knekkebrod', 'length': 6}, {'start_image_id': 251, 'end_image_id': 256, 'theme': 'knekkebrod', 'length': 6}, {'start_image_id': 260, 'end_image_id': 265, 'theme': 'knekkebrod', 'length': 6}]`
- `unknown_product` image/theme footprint: `{'category_id': 355, 'image_count': 90, 'top_images': [{'image_id': 310, 'file_name': 'img_00310.jpg', 'unknown_count': 18, 'dominant_theme': 'knekkebrod'}, {'image_id': 17, 'file_name': 'img_00017.jpg', 'unknown_count': 17, 'dominant_theme': 'varmedrikker'}, {'image_id': 267, 'file_name': 'img_00267.jpg', 'unknown_count': 14, 'dominant_theme': 'knekkebrod'}, {'image_id': 25, 'file_name': 'img_00025.jpeg', 'unknown_count': 13, 'dominant_theme': 'varmedrikker'}, {'image_id': 118, 'file_name': 'img_00118.jpg', 'unknown_count': 11, 'dominant_theme': 'frokost'}, {'image_id': 183, 'file_name': 'img_00183.jpeg', 'unknown_count': 10, 'dominant_theme': 'frokost'}, {'image_id': 304, 'file_name': 'img_00304.jpg', 'unknown_count': 10, 'dominant_theme': 'knekkebrod'}, {'image_id': 14, 'file_name': 'img_00014.jpg', 'unknown_count': 9, 'dominant_theme': 'varmedrikker'}, {'image_id': 58, 'file_name': 'img_00058.jpeg', 'unknown_count': 9, 'dominant_theme': 'varmedrikker'}, {'image_id': 205, 'file_name': 'img_00205.jpeg', 'unknown_count': 9, 'dominant_theme': 'frokost'}, {'image_id': 6, 'file_name': 'img_00006.jpg', 'unknown_count': 8, 'dominant_theme': 'varmedrikker'}, {'image_id': 20, 'file_name': 'img_00020.jpg', 'unknown_count': 8, 'dominant_theme': 'varmedrikker'}, {'image_id': 247, 'file_name': 'img_00247.jpg', 'unknown_count': 8, 'dominant_theme': 'knekkebrod'}, {'image_id': 270, 'file_name': 'img_00270.jpg', 'unknown_count': 8, 'dominant_theme': 'knekkebrod'}, {'image_id': 348, 'file_name': 'img_00348.jpg', 'unknown_count': 8, 'dominant_theme': 'knekkebrod'}, {'image_id': 4, 'file_name': 'img_00004.jpg', 'unknown_count': 7, 'dominant_theme': 'varmedrikker'}, {'image_id': 38, 'file_name': 'img_00038.jpeg', 'unknown_count': 7, 'dominant_theme': 'varmedrikker'}, {'image_id': 195, 'file_name': 'img_00195.jpg', 'unknown_count': 7, 'dominant_theme': 'frokost'}, {'image_id': 229, 'file_name': 'img_00229.jpg', 'unknown_count': 7, 'dominant_theme': 'frokost'}, {'image_id': 302, 'file_name': 'img_00302.jpg', 'unknown_count': 7, 'dominant_theme': 'knekkebrod'}], 'theme_counts': {'knekkebrod': 27, 'varmedrikker': 28, 'frokost': 30, 'other': 3, 'egg': 2}, 'geometry_vs_all': {'center_x': {'min': 0.014552696078431373, 'p01': 0.033264, 'p05': 0.111367, 'p25': 0.419139, 'median': 0.605494708994709, 'mean': 0.567037, 'p75': 0.736111, 'p95': 0.933257, 'p99': 0.980331, 'max': 0.988219246031746}, 'center_y': {'min': 0.04976851851851852, 'p01': 0.093674, 'p05': 0.162212, 'p25': 0.320406, 'median': 0.4598644536652835, 'mean': 0.467429, 'p75': 0.613675, 'p95': 0.778769, 'p99': 0.86672, 'max': 0.8764880952380952}, 'relative_width': {'min': 0.006696428571428571, 'p01': 0.019701, 'p05': 0.024802, 'p25': 0.036458, 'median': 0.0497363982533474, 'mean': 0.059304, 'p75': 0.06994, 'p95': 0.113426, 'p99': 0.203462, 'max': 0.23547094188376755}, 'relative_height': {'min': 0.008267195767195767, 'p01': 0.023479, 'p05': 0.03, 'p25': 0.045384, 'median': 0.0655812324929972, 'mean': 0.07134, 'p75': 0.091141, 'p95': 0.133116, 'p99': 0.171078, 'max': 0.1793478260869565}, 'area_fraction': {'min': 5.536068594104309e-05, 'p01': 0.000607, 'p05': 0.000896, 'p25': 0.001917, 'median': 0.0036073969804618117, 'mean': 0.004441, 'p75': 0.005715, 'p95': 0.011338, 'p99': 0.017386, 'max': 0.02175}, 'all_boxes_area_fraction': {'min': 1.8043482825228857e-05, 'p01': 0.000487, 'p05': 0.001002, 'p25': 0.002132, 'median': 0.00374325, 'mean': 0.005489, 'p75': 0.006987, 'p95': 0.01573, 'p99': 0.025856, 'max': 0.059235572312578505}}}`

Top category co-occurrence pairs:
- `84` images: FIBER BALANCE 230G WASA || KNEKKEBRØD SPORT+ 210G WASA
- `83` images: HAVRE KNEKKEBRØD 300G WASA || FIBER BALANCE 230G WASA
- `82` images: KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA || HAVRE KNEKKEBRØD 300G WASA
- `82` images: HAVRE KNEKKEBRØD 300G WASA || KNEKKEBRØD SPORT+ 210G WASA
- `82` images: KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA || FIBER BALANCE 230G WASA
- `81` images: KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA || FIBER BALANCE 230G WASA
- `81` images: HAVRE KNEKKEBRØD 300G WASA || KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA
- `80` images: KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA || KNEKKEBRØD SPORT+ 210G WASA
- `80` images: KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W || HAVRE KNEKKEBRØD 300G WASA
- `80` images: KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W || FIBER BALANCE 230G WASA
- `80` images: KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA || KNEKKEBRØD SPORT+ 210G WASA
- `79` images: FRUKOST KNEKKEBRØD 240G WASA || FIBER BALANCE 230G WASA
- `79` images: FRUKOST KNEKKEBRØD 240G WASA || KNEKKEBRØD SPORT+ 210G WASA
- `79` images: KNEKKEBRØD RUNDA SESAM&HAVSALT 290G WASA || KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA
- `79` images: KNEKKEBRØD DIN STUND CHIA&HAVSALT 270G W || KNEKKEBRØD SPORT+ 210G WASA

## Duplication / Leakage Risk

- Exact duplicate shelf-image groups: `0`
- Perceptual near-duplicate shelf-image pairs (aHash distance <= 5): `0`
- Exact duplicate packshot groups: `43`
- First exact duplicate packshot groups: `[['42070436/front.jpg', '42070436/main.jpg'], ['70177150242/front.jpg', '70177150242/main.jpg'], ['7035620008542/front.jpg', '7035620008542/main.jpg'], ['7035620046544/front.jpg', '7035620046544/main.jpg'], ['7035620052705/front.jpg', '7035620052705/main.jpg'], ['7035620056864/front.jpg', '7035620056864/main.jpg'], ['7035620058813/front.jpg', '7035620058813/main.jpg'], ['7035620059841/front.jpg', '7035620059841/main.jpg'], ['7038010021145/front.jpg', '7038010021145/main.jpg'], ['7039010564595/front.jpg', '7039010564595/main.jpg'], ['7039610000172/front.jpg', '7039610000172/main.jpg'], ['7039610000196/front.jpg', '7039610000196/main.jpg'], ['7039610000318/front.jpg', '7039610000318/main.jpg'], ['7039610005887/front.jpg', '7039610005887/main.jpg'], ['7039610006761/front.jpg', '7039610006761/main.jpg']]`

## Main Takeaways

- The archives are intact; the drift is in documentation/metadata semantics, not download corruption.
- COCO itself is internally clean: file presence, dimensions, ids, bbox geometry, and `area` all validate.
- COCO is dense and diverse at image level, but still highly imbalanced at class level: the effective class count is far below the raw class count.
- Only a tiny number of box pairs have IoU >= 0.5, but the few cross-category overlaps are informative and expose at least one strong alias/mislabelling candidate (`Leksands Rutbit`).
- Edge-truncated boxes are non-trivial, so crop/context policy matters for both training and error analysis.
- The biggest documentation drift is category count/range plus the missing `product_code/product_name/corrected` fields in `annotations.json`.
- Packshot coverage is strong by annotation mass, not perfect by class count: most shelf boxes have a name-matchable reference, but some long-tail egg/coffee/other classes do not.
- Egg is the weakest theme for reference-based classification: lower exact coverage and much heavier dependence on 1-2-view packshots.
- `metadata.json` cannot be treated as a direct reflection of current COCO box counts.
- The `CUSTOM_*` dirs are real extra assets in the zip and need an explicit policy if we use them.
