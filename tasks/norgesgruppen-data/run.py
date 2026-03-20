import argparse
import json
import numpy as np
from pathlib import Path
from PIL import Image
import onnxruntime as ort
import re


VALID_SUFFIXES = {".jpg", ".jpeg", ".png"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="model.onnx")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--conf", type=float, default=0.001)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    return parser.parse_args()


def letterbox(image: np.ndarray, new_shape: int = 640, color: tuple[int, int, int] = (114, 114, 114)):
    shape = image.shape[:2]  # h, w
    r = min(new_shape / shape[0], new_shape / shape[1])
    new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))  # w, h
    dw = new_shape - new_unpad[0]
    dh = new_shape - new_unpad[1]
    dw /= 2
    dh /= 2

    if shape[::-1] != new_unpad:
        pil = Image.fromarray(image)
        pil = pil.resize(new_unpad, Image.Resampling.BILINEAR)
        image = np.array(pil)

    top = int(round(dh - 0.1))
    bottom = int(round(dh + 0.1))
    left = int(round(dw - 0.1))
    right = int(round(dw + 0.1))
    image = np.pad(
        image,
        ((top, bottom), (left, right), (0, 0)),
        mode="constant",
        constant_values=((color[0], color[0]), (color[1], color[1]), (color[2], color[2])),
    )
    return image, r, (dw, dh)


def parse_image_id(path: Path) -> int:
    m = re.search(r"(\d+)$", path.stem)
    if m is None:
        raise ValueError(f"Could not parse image id from filename: {path.name}")
    return int(m.group(1))


def main():
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    model_path = Path(args.model)
    if not model_path.is_absolute():
        model_path = script_dir / model_path

    session_options = ort.SessionOptions()
    session_options.intra_op_num_threads = 1
    session_options.inter_op_num_threads = 1
    if args.device == "cuda":
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    else:
        providers = ["CPUExecutionProvider"]
    session = ort.InferenceSession(
        str(model_path),
        providers=providers,
        sess_options=session_options,
    )
    input_name = session.get_inputs()[0].name
    predictions = []

    for img_path in sorted(Path(args.input).iterdir()):
        if img_path.suffix.lower() not in VALID_SUFFIXES:
            continue
        image_id = parse_image_id(img_path)

        original = np.array(Image.open(img_path).convert("RGB"))
        orig_h, orig_w = original.shape[:2]
        padded, ratio, (pad_w, pad_h) = letterbox(original, new_shape=args.imgsz)

        arr = padded.astype(np.float32) / 255.0
        arr = np.transpose(arr, (2, 0, 1))[np.newaxis, ...]

        outputs = session.run(None, {input_name: arr})
        det = outputs[0]
        if det.ndim == 3:
            det = det[0]

        for row in det:
            if len(row) < 6:
                continue
            x1, y1, x2, y2, score, _cls = row[:6]
            score = float(score)
            if score < args.conf:
                continue

            # Undo letterbox transform from model input space to original image space.
            x1 = (float(x1) - pad_w) / ratio
            y1 = (float(y1) - pad_h) / ratio
            x2 = (float(x2) - pad_w) / ratio
            y2 = (float(y2) - pad_h) / ratio

            x1 = max(0.0, min(x1, orig_w))
            y1 = max(0.0, min(y1, orig_h))
            x2 = max(0.0, min(x2, orig_w))
            y2 = max(0.0, min(y2, orig_h))

            w = max(0.0, x2 - x1)
            h = max(0.0, y2 - y1)
            if w <= 0.0 or h <= 0.0:
                continue

            predictions.append(
                {
                    "image_id": image_id,
                    "category_id": 0,
                    "bbox": [x1, y1, w, h],
                    "score": score,
                }
            )

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(predictions, f)


if __name__ == "__main__":
    main()
