#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any


FEATURE_SIZE = 16


def clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def ffmpeg_rgb16(source_path: Path, crop_box: tuple[int, int, int, int] | None) -> bytes:
    filters = []
    if crop_box is not None:
        crop_x1, crop_y1, crop_x2, crop_y2 = crop_box
        crop_width = max(1, crop_x2 - crop_x1)
        crop_height = max(1, crop_y2 - crop_y1)
        filters.append(f"crop={crop_width}:{crop_height}:{crop_x1}:{crop_y1}")
    filters.append(f"scale={FEATURE_SIZE}:{FEATURE_SIZE}:flags=lanczos")
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(source_path),
        "-vf",
        ",".join(filters),
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    expected_size = FEATURE_SIZE * FEATURE_SIZE * 3
    if len(result.stdout) != expected_size:
        raise ValueError(f"Unexpected raw frame size from {source_path}: {len(result.stdout)} != {expected_size}")
    return result.stdout


def block_average(values: list[int], x0: int, y0: int, block_size: int) -> int:
    total = 0
    count = 0
    for y in range(y0, y0 + block_size):
        row_offset = y * FEATURE_SIZE
        for x in range(x0, x0 + block_size):
            total += values[row_offset + x]
            count += 1
    return round(total / count)


def rgb_feature_from_raw(raw_rgb: bytes) -> dict[str, Any]:
    pixels = list(raw_rgb)
    reds = []
    greens = []
    blues = []
    luminance = []
    for index in range(0, len(pixels), 3):
        red = pixels[index]
        green = pixels[index + 1]
        blue = pixels[index + 2]
        reds.append(red)
        greens.append(green)
        blues.append(blue)
        luminance.append((77 * red + 150 * green + 29 * blue) >> 8)

    lum_8x8 = []
    for y in range(0, FEATURE_SIZE, 2):
        for x in range(0, FEATURE_SIZE, 2):
            lum_8x8.append(block_average(luminance, x, y, 2))
    lum_mean = sum(lum_8x8) / len(lum_8x8)
    ahash = 0
    for value in lum_8x8:
        ahash = (ahash << 1) | int(value >= lum_mean)

    red_mean = round(sum(reds) / len(reds))
    green_mean = round(sum(greens) / len(greens))
    blue_mean = round(sum(blues) / len(blues))

    color_hashes = {"red": 0, "green": 0, "blue": 0}
    for channel_name, channel_values, channel_mean in (
        ("red", reds, red_mean),
        ("green", greens, green_mean),
        ("blue", blues, blue_mean),
    ):
        for y in range(0, FEATURE_SIZE, 4):
            for x in range(0, FEATURE_SIZE, 4):
                block_value = block_average(channel_values, x, y, 4)
                color_hashes[channel_name] = (color_hashes[channel_name] << 1) | int(block_value >= channel_mean)

    return {
        "ahash": ahash,
        "color_hash_red": color_hashes["red"],
        "color_hash_green": color_hashes["green"],
        "color_hash_blue": color_hashes["blue"],
        "mean_rgb": [red_mean, green_mean, blue_mean],
    }


def feature_distance(a: dict[str, Any], b: dict[str, Any]) -> float:
    ahash_distance = (a["ahash"] ^ b["ahash"]).bit_count()
    color_distance = (
        (a["color_hash_red"] ^ b["color_hash_red"]).bit_count()
        + (a["color_hash_green"] ^ b["color_hash_green"]).bit_count()
        + (a["color_hash_blue"] ^ b["color_hash_blue"]).bit_count()
    )
    mean_rgb_distance = sum(abs(x - y) for x, y in zip(a["mean_rgb"], b["mean_rgb"]))
    return ahash_distance + 0.5 * color_distance + (mean_rgb_distance / 64.0)


def compute_crop_box_from_bbox_xyxy(
    bbox_xyxy: tuple[float, float, float, float] | list[float],
    image_width: int,
    image_height: int,
    padding_px: int,
    padding_frac: float,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox_xyxy
    width = x2 - x1
    height = y2 - y1
    pad_x = padding_px + round(width * padding_frac)
    pad_y = padding_px + round(height * padding_frac)
    crop_x1 = clamp(int(x1 - pad_x), 0, image_width)
    crop_y1 = clamp(int(y1 - pad_y), 0, image_height)
    crop_x2 = clamp(int(x2 + pad_x), 0, image_width)
    crop_y2 = clamp(int(y2 + pad_y), 0, image_height)
    if crop_x2 <= crop_x1:
        crop_x2 = min(image_width, crop_x1 + 1)
    if crop_y2 <= crop_y1:
        crop_y2 = min(image_height, crop_y1 + 1)
    return crop_x1, crop_y1, crop_x2, crop_y2


def compute_query_crop_box(row: dict[str, Any], padding_px: int, padding_frac: float) -> tuple[int, int, int, int]:
    return compute_crop_box_from_bbox_xyxy(
        bbox_xyxy=row["bbox_xyxy"],
        image_width=row["image_width"],
        image_height=row["image_height"],
        padding_px=padding_px,
        padding_frac=padding_frac,
    )


class RetrievalBackend:
    backend_name = "base"
    default_model_id: str | None = None

    def __init__(self, model_id: str | None = None, device: str = "auto", batch_size: int = 32):
        self.model_id = model_id or self.default_model_id
        self.requested_device = device
        self.batch_size = batch_size

    def resolved_device(self) -> str:
        return "cpu"

    def embed_specs(self, specs: list[dict[str, Any]]) -> dict[str, Any]:
        raise NotImplementedError

    def load_embeddings_cache(self, path: Path) -> dict[str, Any]:
        raise NotImplementedError

    def save_embeddings_cache(self, path: Path, embeddings: dict[str, Any]) -> None:
        raise NotImplementedError

    def rank_categories(
        self,
        query_embedding: Any,
        gallery_embeddings: dict[str, Any],
        gallery_entries: list[dict[str, Any]],
    ) -> list[int]:
        return [
            row["category_id"]
            for row in self.rank_category_scores(
                query_embedding=query_embedding,
                gallery_embeddings=gallery_embeddings,
                gallery_entries=gallery_entries,
            )
        ]

    def rank_category_scores(
        self,
        query_embedding: Any,
        gallery_embeddings: dict[str, Any],
        gallery_entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    def describe(self) -> dict[str, Any]:
        return {
            "backend": self.backend_name,
            "model_id": self.model_id,
            "requested_device": self.requested_device,
            "resolved_device": self.resolved_device(),
            "batch_size": self.batch_size,
        }


class HashDebugBackend(RetrievalBackend):
    backend_name = "hash_debug"

    def embed_specs(self, specs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        embeddings = {}
        for index, spec in enumerate(specs, start=1):
            raw = ffmpeg_rgb16(spec["source_path"], crop_box=spec.get("crop_box"))
            embeddings[spec["spec_id"]] = rgb_feature_from_raw(raw)
            if index % 100 == 0 or index == len(specs):
                print(f"[{self.backend_name}] embedded {index}/{len(specs)} specs")
        return embeddings

    def rank_categories(
        self,
        query_embedding: dict[str, Any],
        gallery_embeddings: dict[str, dict[str, Any]],
        gallery_entries: list[dict[str, Any]],
    ) -> list[int]:
        return [
            row["category_id"]
            for row in self.rank_category_scores(
                query_embedding=query_embedding,
                gallery_embeddings=gallery_embeddings,
                gallery_entries=gallery_entries,
            )
        ]

    def rank_category_scores(
        self,
        query_embedding: dict[str, Any],
        gallery_embeddings: dict[str, dict[str, Any]],
        gallery_entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        best_by_category = {}
        for entry in gallery_entries:
            distance = feature_distance(query_embedding, gallery_embeddings[entry["spec_id"]])
            score = -float(distance)
            current = best_by_category.get(entry["category_id"])
            if current is None or score > current["score"]:
                best_by_category[entry["category_id"]] = {
                    "category_id": entry["category_id"],
                    "score": score,
                    "product_code": entry["product_code"],
                    "source": entry["source"],
                    "spec_id": entry["spec_id"],
                }
        return sorted(best_by_category.values(), key=lambda row: (-row["score"], row["category_id"]))

    def load_embeddings_cache(self, path: Path) -> dict[str, Any]:
        return json.loads(path.read_text())

    def save_embeddings_cache(self, path: Path, embeddings: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(embeddings, indent=2, ensure_ascii=False) + "\n")


class TorchVectorBackend(RetrievalBackend):
    def __init__(self, model_id: str | None = None, device: str = "auto", batch_size: int = 32):
        super().__init__(model_id=model_id, device=device, batch_size=batch_size)
        self._torch = None
        self._resolved_device = None
        self._model_loaded = False
        self._cached_source_path = None
        self._cached_source_image = None

    def _require_torch(self):
        if self._torch is None:
            try:
                import torch
            except ModuleNotFoundError as exc:
                raise RuntimeError("Missing torch. Set up the uv ML env first.") from exc
            self._torch = torch
        return self._torch

    def resolved_device(self) -> str:
        if self._resolved_device is not None:
            return self._resolved_device
        torch = self._require_torch()
        if self.requested_device != "auto":
            self._resolved_device = self.requested_device
        else:
            self._resolved_device = "cuda" if torch.cuda.is_available() else "cpu"
        return self._resolved_device

    def _load_model(self) -> None:
        raise NotImplementedError

    def _ensure_loaded(self) -> None:
        if not self._model_loaded:
            if not self.model_id:
                raise RuntimeError(f"{self.backend_name} requires --model-id or a default model id.")
            self._load_model()
            self._model_loaded = True

    def _load_pil_image(self, spec: dict[str, Any]):
        try:
            from PIL import Image
        except ModuleNotFoundError as exc:
            raise RuntimeError("Missing Pillow. Set up the uv ML env first.") from exc

        source_path = Path(spec["source_path"]).resolve()
        if self._cached_source_path != source_path or self._cached_source_image is None:
            with Image.open(source_path) as opened:
                self._cached_source_image = opened.convert("RGB")
            self._cached_source_path = source_path
        image = self._cached_source_image
        crop_box = spec.get("crop_box")
        if crop_box is not None:
            return image.crop(crop_box)
        return image.copy()

    def _encode_pil_images(self, images: list[Any]):
        raise NotImplementedError

    def embed_specs(self, specs: list[dict[str, Any]]) -> dict[str, Any]:
        self._ensure_loaded()
        ordered_specs = sorted(
            specs,
            key=lambda spec: (str(Path(spec["source_path"]).resolve()), str(spec["spec_id"])),
        )
        embeddings = {}
        total_batches = (len(ordered_specs) + self.batch_size - 1) // self.batch_size
        for batch_index, start in enumerate(range(0, len(ordered_specs), self.batch_size), start=1):
            batch_specs = ordered_specs[start:start + self.batch_size]
            batch_images = [self._load_pil_image(spec) for spec in batch_specs]
            batch_embeddings = self._encode_pil_images(batch_images)
            for spec, embedding in zip(batch_specs, batch_embeddings, strict=True):
                embeddings[spec["spec_id"]] = embedding
            print(f"[{self.backend_name}] embedded batch {batch_index}/{total_batches}")
        return embeddings

    def rank_categories(
        self,
        query_embedding: Any,
        gallery_embeddings: dict[str, Any],
        gallery_entries: list[dict[str, Any]],
    ) -> list[int]:
        return [
            row["category_id"]
            for row in self.rank_category_scores(
                query_embedding=query_embedding,
                gallery_embeddings=gallery_embeddings,
                gallery_entries=gallery_entries,
            )
        ]

    def rank_category_scores(
        self,
        query_embedding: Any,
        gallery_embeddings: dict[str, Any],
        gallery_entries: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        best_by_category = {}
        for entry in gallery_entries:
            score = float((query_embedding * gallery_embeddings[entry["spec_id"]]).sum().item())
            current = best_by_category.get(entry["category_id"])
            if current is None or score > current["score"]:
                best_by_category[entry["category_id"]] = {
                    "category_id": entry["category_id"],
                    "score": score,
                    "product_code": entry["product_code"],
                    "source": entry["source"],
                    "spec_id": entry["spec_id"],
                }
        return sorted(best_by_category.values(), key=lambda row: (-row["score"], row["category_id"]))

    def load_embeddings_cache(self, path: Path) -> dict[str, Any]:
        torch = self._require_torch()
        return torch.load(path, map_location="cpu")

    def save_embeddings_cache(self, path: Path, embeddings: dict[str, Any]) -> None:
        torch = self._require_torch()
        path.parent.mkdir(parents=True, exist_ok=True)
        torch.save(embeddings, path)


class PECoreOpenClipBackend(TorchVectorBackend):
    backend_name = "pe_core_openclip"
    default_model_id = "hf-hub:timm/PE-Core-B-16"

    def _load_model(self) -> None:
        torch = self._require_torch()
        try:
            import open_clip
        except ModuleNotFoundError as exc:
            raise RuntimeError("Missing open_clip_torch. Set up the uv ML env first.") from exc

        model, _unused, preprocess = open_clip.create_model_and_transforms(self.model_id)
        self._open_clip = open_clip
        self._model = model.to(self.resolved_device()).eval()
        self._preprocess = preprocess
        self._torch = torch

    def _encode_pil_images(self, images: list[Any]):
        torch = self._require_torch()
        pixel_values = torch.stack([self._preprocess(image) for image in images]).to(self.resolved_device())
        with torch.inference_mode():
            embeddings = self._model.encode_image(pixel_values, normalize=True)
        return embeddings.cpu()


class DINOv3TransformersBackend(TorchVectorBackend):
    backend_name = "dinov3_transformers"
    default_model_id = "facebook/dinov3-vits16-pretrain-lvd1689m"

    def _load_model(self) -> None:
        torch = self._require_torch()
        try:
            from transformers import AutoImageProcessor, AutoModel
        except ModuleNotFoundError as exc:
            raise RuntimeError("Missing transformers. Set up the uv ML env first.") from exc

        self._processor = AutoImageProcessor.from_pretrained(self.model_id)
        self._model = AutoModel.from_pretrained(self.model_id).to(self.resolved_device()).eval()
        self._torch = torch

    def _encode_pil_images(self, images: list[Any]):
        torch = self._require_torch()
        inputs = self._processor(images=images, return_tensors="pt")
        inputs = {key: value.to(self.resolved_device()) for key, value in inputs.items()}
        with torch.inference_mode():
            outputs = self._model(**inputs)
            embedding = getattr(outputs, "pooler_output", None)
            if embedding is None:
                embedding = outputs.last_hidden_state[:, 0]
            embedding = torch.nn.functional.normalize(embedding, dim=-1)
        return embedding.cpu()


class DINOv3TimmBackend(TorchVectorBackend):
    backend_name = "dinov3_timm"
    default_model_id = "convnext_large.dinov3_lvd1689m"

    def _load_model(self) -> None:
        torch = self._require_torch()
        try:
            import timm
        except ModuleNotFoundError as exc:
            raise RuntimeError("Missing timm. Set up the uv ML env first.") from exc

        self._timm = timm
        self._model = timm.create_model(
            self.model_id,
            pretrained=True,
            num_classes=0,
        ).to(self.resolved_device()).eval()
        data_config = timm.data.resolve_model_data_config(self._model)
        self._transform = timm.data.create_transform(**data_config, is_training=False)
        self._torch = torch

    def _encode_pil_images(self, images: list[Any]):
        torch = self._require_torch()
        pixel_values = torch.stack([self._transform(image) for image in images]).to(self.resolved_device())
        with torch.inference_mode():
            embedding = self._model(pixel_values)
            embedding = torch.nn.functional.normalize(embedding, dim=-1)
        return embedding.cpu()


def build_backend(backend_name: str, model_id: str | None, device: str, batch_size: int) -> RetrievalBackend:
    if backend_name == "hash_debug":
        return HashDebugBackend(model_id=model_id, device=device, batch_size=batch_size)
    if backend_name == "pe_core_openclip":
        return PECoreOpenClipBackend(model_id=model_id, device=device, batch_size=batch_size)
    if backend_name == "dinov3_timm":
        return DINOv3TimmBackend(model_id=model_id, device=device, batch_size=batch_size)
    if backend_name == "dinov3_transformers":
        return DINOv3TransformersBackend(model_id=model_id, device=device, batch_size=batch_size)
    raise ValueError(f"Unsupported backend: {backend_name}")
