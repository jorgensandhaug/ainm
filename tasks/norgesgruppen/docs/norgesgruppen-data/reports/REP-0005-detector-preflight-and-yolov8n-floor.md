# REP-0005 Detector Preflight And YOLOv8n Floor

## Scope

- `EXP-0006`
- detector runtime hardening
- tiny overfit sanity
- zero-shot `yolov8n.pt` class-agnostic floor on blocked val

## Bottom Line

The detector lane is now technically unblocked.

Three concrete facts are locked:

- the local detector env is fixed and reproducible
- class-agnostic fine-tuning is learnable on this dataset
- stock COCO `yolov8n.pt` is a weak localization floor here, so fine-tuning is mandatory

## Runtime Fix

The original detector blocker was not data or model logic.

It was env drift:

- floating install pulled `numpy 2.4.3`
- `ultralytics 8.1.0` validation then crashed on `np.trapz`

The canonical detector setup now pins:

- `python 3.11`
- `torch 2.6.0`
- `torchvision 0.21.0`
- `ultralytics 8.1.0`
- `numpy 1.26.4`
- `Pillow 10.2.0`
- `opencv-python-headless 4.9.0.80`

Local host read:

- `torch.cuda.is_available()` -> `False`
- so this workstation is `cpu-only`

## Overfit Sanity

4-image class-agnostic subset:

- image ids: `21,100,155,255`
- `40` epochs
- `960` imgsz
- batch `2`
- no aug

Best/final internal YOLO val metrics:

- precision `0.88349`
- recall `0.63195`
- `mAP50 0.78879`
- `mAP50-95 0.59923`

Interpretation:

- the pipeline now trains and validates end-to-end
- the subset is learnable
- this is not a dead detector path

It is not a perfect overfit, but it is a strong enough sanity pass to proceed.

## Zero-Shot Detector Floor

Blocked val, pretrained `yolov8n.pt`, no fine-tuning, class ignored at eval:

- images `49`
- GT boxes `4404`
- predictions `14541`
- `AP50 0.156996`
- `AP75 0.059735`
- `mAP50-95 0.07006`
- miss rate `0.475023`
- duplicate-box rate `0.109071`
- background-FP rate `0.73193`
- count MAE `86`

This is bad, but useful.

It proves:

- raw COCO priors do see some product facings
- off-the-shelf open detection is nowhere near enough
- fine-tuning is not optional

## Full-Split 1-Epoch Smoke

Fine-tuned `yolov8n` on the real blocked split:

- `199` train images
- `49` val images
- `1` epoch
- `960` imgsz
- batch `2`
- cpu-only host

Internal YOLO single-class val:

- precision `0.666516`
- recall `0.717302`
- `mAP50 0.706996`
- `mAP50-95 0.369238`

Canonical class-agnostic eval on saved predictions:

- `AP50 0.689607`
- `AP75 0.297072`
- `mAP50-95 0.345672`
- miss rate `0.104905`
- duplicate-box rate `0.175102`
- background-FP rate `0.556735`
- count MAE `72.510204`

This is the most important new detector result so far.

After only one epoch, the detector jumps from:

- zero-shot `AP50 0.156996`

to:

- fine-tuned `AP50 0.689607`

So the dataset has strong detector-learning signal immediately.

Theme read after just one epoch:

- `egg` `AP50 0.847126`, miss rate `0.035857`
- `frokost` `0.823005`, miss rate `0.029412`
- `varmedrikker` `0.811304`, miss rate `0.033684`
- `knekkebrod` is the weak shelf regime already: `0.61067`, miss rate `0.178326`
- `other` is noisy and count-heavy

## What Still Needs Work

The smoke checkpoint is already good enough to justify real detector work, but it is not submission-ready.

Current issues:

- predictor saturates `300` detections per image
- duplicate rate still high
- background FP rate still high
- count MAE still too large

So the next gains are likely to come from:

- more training
- confidence/NMS tuning
- score calibration
- possibly detector-family comparison later, but not before a real YOLO baseline exists

## Theme Read

Zero-shot `yolov8n.pt` is least bad on `egg`:

- `egg` `AP50 0.386567`

It is much weaker on the denser shelf regimes:

- `frokost` `AP50 0.123991`
- `knekkebrod` similarly weak

This fits the dataset geometry:

- simpler egg packaging
- much harder dense repetitive fronts in breakfast and crispbread sections

## Strategic Read

This result narrows the path forward:

1. stop treating stock detector performance as a viable floor for submissions
2. run the first real fine-tuned class-agnostic baseline now
3. keep detector work on the critical path because oracle-box `PE-Core` already showed hybrid `0.860238`
4. prioritize longer YOLO training and detector-score cleanup before heavier detector families
5. do not spend the next cycle on alternative zero-shot detector families before a tuned baseline exists

## Practical Decision

Best next move:

- run full blocked-split fine-tuned `YOLOv8n` for `EXP-0006` beyond `1` epoch
- then score detector boxes under `EXP-0012` oracle-class logic

Operational note:

- on this local host, that is a `cpu-only` run
- if a remote GPU host is available, move the full detector baseline there immediately
