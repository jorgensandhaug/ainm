# NorgesGruppen Data

Date: 2026-03-19

## What it is

Object detection on grocery shelf images.

You upload a `.zip` containing inference code. Organizers run it in a sandboxed Docker container with GPU, no network, and fixed package versions.

## Core task

Given shelf images, output product detections:

- bounding box
- category id
- confidence

This is not just detection. Final score also rewards correct product identity.

## Data

Two main downloads from the competition site:

### COCO dataset

- file: `NM_NGD_coco_dataset.zip`
- size: about `864 MB`
- `254` shelf images
- about `22,300` annotations
- `357` categories with ids `0-356`
- store sections represented: Egg, Frokost, Knekkebrod, Varmedrikker

Annotation format is COCO:

```json
{
  "image_id": 1,
  "category_id": 42,
  "bbox": [141, 49, 169, 152]
}
```

`bbox` is `[x, y, width, height]`.

### Product reference images

- file: `NM_NGD_product_images.zip`
- size: about `60 MB`
- `327` products
- multi-angle shots per product
- includes `metadata.json`

Useful for:

- product identity cues
- label matching
- secondary classification systems

## Submission contract

Your zip must contain `run.py` at root.

Expected structure:

```text
submission.zip
├── run.py
├── model.onnx
└── utils.py
```

Sandbox invokes:

```bash
python run.py --input /data/images --output /output/predictions.json
```

Your script must write a JSON array like:

```json
[
  {
    "image_id": 42,
    "category_id": 0,
    "bbox": [120.5, 45.0, 80.0, 110.0],
    "score": 0.923
  }
]
```

Field semantics:

- `image_id`: from filename, eg `img_00042.jpg -> 42`
- `category_id`: integer `0-356`
- `bbox`: COCO format `[x, y, w, h]`
- `score`: confidence `0-1`

## Scoring

Final score:

```text
score = 0.7 * detection_mAP + 0.3 * classification_mAP
```

Both components use `mAP@0.5`.

### Detection mAP

- IoU threshold `>= 0.5`
- category ignored
- rewards finding products at right locations

### Classification mAP

- IoU threshold `>= 0.5`
- category must match
- rewards correct product identity

### Important implication

Detection-only submissions can still reach `0.70` if localization is strong and you set a fixed category strategy.

## Submission limits

- in-flight submissions per team: `2`
- submissions per day: `3`
- infra-failure freebies: `2/day`

Resets at midnight UTC.

## Sandbox environment

- Python `3.11`
- CPU `4 vCPU`
- memory `8 GB`
- GPU `NVIDIA L4`, `24 GB VRAM`
- CUDA `12.4`
- network: none
- timeout: `300s`

GPU is always available.

Useful check:

```python
torch.cuda.is_available()
```

For ONNX:

```python
providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
```

## Preinstalled packages

Important pinned packages in sandbox:

- `torch 2.6.0+cu124`
- `torchvision 0.21.0+cu124`
- `ultralytics 8.1.0`
- `onnxruntime-gpu 1.20.0`
- `opencv-python-headless 4.9.0.80`
- `albumentations 1.3.1`
- `pycocotools 2.0.7`
- `timm 0.9.12`
- `safetensors 0.4.2`

No runtime `pip install`.

## File/package limits

- max uncompressed zip size: `420 MB`
- max files: `1000`
- max Python files: `10`
- max weight files: `3`
- max total weight size: `420 MB`

Allowed file types:

- `.py`
- `.json`
- `.yaml`
- `.yml`
- `.cfg`
- `.pt`
- `.pth`
- `.onnx`
- `.safetensors`
- `.npy`

## Security restrictions

Blocked by security scan:

- `import os`
- `import subprocess`
- `import socket`
- `import ctypes`
- `import builtins`
- `eval`
- `exec`
- `compile`
- `__import__`

Also blocked:

- ELF binaries
- symlinks
- path traversal

Use `pathlib`, not `os`.

## Model strategy options

### 1. YOLO-family baseline

Strongest simple baseline if version-pinned correctly.

- train/fine-tune with `ultralytics==8.1.0`
- set `nc=357`
- submit `.pt` if package versions match exactly
- safer fallback: export to ONNX

### 2. ONNX export

Best portability path.

Good when:

- training framework not installed in sandbox
- you want fewer version-mismatch issues
- you need custom architecture support

Constraint:

- export with `opset <= 20`
- docs recommend `opset 17`

### 3. Custom PyTorch + state_dict

Works if model only uses standard PyTorch ops and you bring your model code in `.py` files.

## Version pitfalls

- newer ultralytics weights may fail in `8.1.0`
- `torch.save(model)` is riskier than `state_dict`
- newer `timm` may break layer naming
- ONNX opset too new may fail in sandbox

Safest path:

- pin exact versions during training, or
- export to ONNX

## Practical baseline ladder

### Baseline 0

Random predictions just to validate zip/output contract.

### Baseline 1

Pretrained YOLO detector to validate runtime and bbox flow, even if categories are wrong.

### Baseline 2

Fine-tuned detector on competition data with `357` classes.

### Baseline 3

Detector + separate product-ID refinement using reference images.

Possible refinement ideas:

- crop detected products, then re-rank category with embedding similarity
- ensemble multiple detectors
- TTA if still within `300s`
- FP16 inference on GPU

## Failure modes to avoid

- `run.py` not at zip root
- macOS junk files in zip
- disallowed `.bin` weights
- no output written to provided `--output`
- timeout from CPU inference or huge model
- OOM from large batch size
- version mismatch on model load

## Best first implementation

If optimizing for speed:

1. train a YOLOv8 baseline on the supplied COCO data
2. export to ONNX
3. write minimal `run.py` with ONNX Runtime GPU inference
4. process images one by one
5. emit valid predictions JSON

## Source

Compiled from `ainm-docs` MCP resources:

- `challenge://norgesgruppen-data/overview`
- `challenge://norgesgruppen-data/submission`
- `challenge://norgesgruppen-data/scoring`
- `challenge://norgesgruppen-data/examples`
