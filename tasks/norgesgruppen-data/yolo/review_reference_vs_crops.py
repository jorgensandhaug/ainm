from __future__ import annotations

import argparse
import json
import os
import random
from dataclasses import dataclass
from pathlib import Path

import tkinter as tk
from PIL import Image, ImageDraw, ImageOps

VALID_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass
class ClassInfo:
    class_id: int
    class_name: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Interactive viewer for checking reference photos vs classifier crops "
            "for the same class id."
        )
    )
    parser.add_argument(
        "--annotations",
        default="data/train/annotations.json",
        help="COCO annotations file with categories (id -> name).",
    )
    parser.add_argument(
        "--reference-root",
        default="data/product_images_with_id",
        help="Folder containing class-id subfolders with reference images.",
    )
    parser.add_argument(
        "--crops-root",
        default="data/classifier/crops",
        help="Folder containing class-id subfolders with crop images.",
    )
    parser.add_argument(
        "--notes-path",
        default="runs/review/reference_vs_crops_notes.json",
        help="Where notes are stored as JSON (by class id).",
    )
    parser.add_argument(
        "--crop-count",
        type=int,
        default=12,
        help="Number of random crops shown per class.",
    )
    parser.add_argument(
        "--thumb-size",
        type=int,
        default=200,
        help="Thumbnail edge size (pixels).",
    )
    parser.add_argument(
        "--start-id",
        type=int,
        default=None,
        help="Optional class id to start from.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used for sampling crop images.",
    )
    parser.add_argument(
        "--mode",
        choices=["auto", "gui", "export"],
        default="auto",
        help="Use 'gui' for interactive Tk viewer, 'export' for headless board generation.",
    )
    parser.add_argument(
        "--export-dir",
        default="runs/review/boards",
        help="Output directory used in --mode export.",
    )
    return parser.parse_args()


def resolve(base: Path, path_str: str) -> Path:
    p = Path(path_str)
    if p.is_absolute():
        return p
    return (base / p).resolve()


def load_classes(annotations_path: Path) -> list[ClassInfo]:
    coco = json.loads(annotations_path.read_text())
    classes = [ClassInfo(class_id=int(c["id"]), class_name=str(c["name"])) for c in coco["categories"]]
    classes.sort(key=lambda c: c.class_id)
    return classes


def list_images(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted([p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in VALID_IMAGE_SUFFIXES])


def read_notes(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def write_notes(path: Path, notes: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(notes, ensure_ascii=False, indent=2) + "\n")


def fit_tile(image_path: Path, tile_size: int, border_color: tuple[int, int, int]) -> Image.Image:
    with Image.open(image_path).convert("RGB") as image:
        thumb = ImageOps.contain(image, (tile_size - 8, tile_size - 28))
        tile = Image.new("RGB", (tile_size, tile_size), color=(24, 24, 24))
        x = (tile_size - thumb.width) // 2
        y = 4 + (tile_size - 28 - thumb.height) // 2
        tile.paste(thumb, (x, y))
    draw = ImageDraw.Draw(tile)
    draw.rectangle([(0, 0), (tile_size - 1, tile_size - 1)], outline=border_color, width=2)
    label = image_path.name
    draw.text((5, tile_size - 20), label[:28], fill=(255, 255, 255))
    return tile


def build_strip(title: str, image_paths: list[Path], tile_size: int, border_color: tuple[int, int, int]) -> Image.Image:
    count = max(1, len(image_paths))
    width = count * tile_size
    title_h = 36
    strip = Image.new("RGB", (width, tile_size + title_h), color=(16, 16, 16))
    draw = ImageDraw.Draw(strip)
    draw.text((8, 10), title, fill=(255, 255, 255))
    if not image_paths:
        draw.text((8, 18 + title_h), "No images", fill=(180, 120, 120))
        return strip
    for idx, img_path in enumerate(image_paths):
        tile = fit_tile(img_path, tile_size, border_color)
        strip.paste(tile, (idx * tile_size, title_h))
    return strip


def compose_canvas(
    class_info: ClassInfo,
    ref_paths: list[Path],
    crop_paths: list[Path],
    tile_size: int,
) -> Image.Image:
    ref_strip = build_strip("Reference images", ref_paths, tile_size, (80, 180, 255))
    crop_strip = build_strip("Dataset crops", crop_paths, tile_size, (255, 160, 80))
    width = max(ref_strip.width, crop_strip.width)
    top_h = 44
    gap = 12
    height = top_h + ref_strip.height + gap + crop_strip.height
    canvas = Image.new("RGB", (width, height), color=(12, 12, 12))
    draw = ImageDraw.Draw(canvas)
    title = f"class_id={class_info.class_id}  name={class_info.class_name}"
    draw.text((8, 12), title[:220], fill=(255, 255, 255))
    canvas.paste(ref_strip, (0, top_h))
    canvas.paste(crop_strip, (0, top_h + ref_strip.height + gap))
    return canvas


def class_dir_names(class_id: int) -> list[str]:
    return [str(class_id), f"{class_id:03d}"]


def get_reference_paths(reference_root: Path, class_id: int) -> list[Path]:
    for name in class_dir_names(class_id):
        paths = list_images(reference_root / name)
        if paths:
            return paths
    return []


def get_crop_paths(
    crops_root: Path, class_id: int, crop_count: int, rng: random.Random
) -> list[Path]:
    for name in class_dir_names(class_id):
        paths = list_images(crops_root / name)
        if paths:
            if len(paths) <= crop_count:
                return paths
            return sorted(rng.sample(paths, crop_count))
    return []


def export_review_boards(
    classes: list[ClassInfo],
    reference_root: Path,
    crops_root: Path,
    notes_path: Path,
    export_dir: Path,
    crop_count: int,
    thumb_size: int,
    seed: int,
) -> None:
    export_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    existing_notes = read_notes(notes_path)

    index_rows: list[dict[str, object]] = []
    for class_info in classes:
        ref_paths = get_reference_paths(reference_root, class_info.class_id)
        crop_paths = get_crop_paths(crops_root, class_info.class_id, crop_count, rng)
        board = compose_canvas(class_info, ref_paths, crop_paths, thumb_size)
        out_name = f"{class_info.class_id:03d}.jpg"
        board.save(export_dir / out_name, quality=95)
        index_rows.append(
            {
                "class_id": class_info.class_id,
                "class_name": class_info.class_name,
                "board_file": out_name,
                "ref_count": len(ref_paths),
                "crop_count": len(crop_paths),
                "note": existing_notes.get(str(class_info.class_id), ""),
            }
        )

    (export_dir / "index.json").write_text(
        json.dumps({"boards": index_rows}, ensure_ascii=False, indent=2) + "\n"
    )

    notes_template_lines = ["class_id,class_name,note"]
    for row in index_rows:
        name = str(row["class_name"]).replace('"', '""')
        note = str(row["note"]).replace('"', '""')
        notes_template_lines.append(f'{row["class_id"]},"{name}","{note}"')
    (export_dir / "notes_template.csv").write_text("\n".join(notes_template_lines) + "\n")

    print(f"Exported {len(index_rows)} review boards to: {export_dir}")
    print(f"Board index: {export_dir / 'index.json'}")
    print(f"Notes template: {export_dir / 'notes_template.csv'}")


class ReviewerApp:
    def __init__(
        self,
        root: tk.Tk,
        classes: list[ClassInfo],
        reference_root: Path,
        crops_root: Path,
        notes_path: Path,
        crop_count: int,
        thumb_size: int,
        seed: int,
        start_id: int | None,
    ) -> None:
        self.root = root
        self.classes = classes
        self.reference_root = reference_root
        self.crops_root = crops_root
        self.notes_path = notes_path
        self.crop_count = crop_count
        self.thumb_size = thumb_size
        self.rng = random.Random(seed)
        self.notes = read_notes(notes_path)
        self.index = 0
        if start_id is not None:
            for idx, c in enumerate(classes):
                if c.class_id == start_id:
                    self.index = idx
                    break
        self._photo = None

        self.root.title("Reference vs crops reviewer")
        self.root.geometry("1400x900")

        top = tk.Frame(root)
        top.pack(fill=tk.X, padx=8, pady=8)

        self.info_var = tk.StringVar()
        tk.Label(top, textvariable=self.info_var, anchor="w").pack(side=tk.LEFT, fill=tk.X, expand=True)

        self.jump_entry = tk.Entry(top, width=8)
        self.jump_entry.pack(side=tk.RIGHT, padx=4)
        tk.Button(top, text="Jump ID", command=self.jump_to_id).pack(side=tk.RIGHT, padx=4)

        self.image_label = tk.Label(root, bg="#111111")
        self.image_label.pack(fill=tk.BOTH, expand=True, padx=8, pady=4)

        bottom = tk.Frame(root)
        bottom.pack(fill=tk.X, padx=8, pady=8)
        tk.Label(bottom, text="Note:").pack(side=tk.LEFT)
        self.note_entry = tk.Entry(bottom)
        self.note_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=6)
        tk.Button(bottom, text="Save Note", command=self.save_note).pack(side=tk.LEFT, padx=4)
        tk.Button(bottom, text="Prev", command=self.prev_class).pack(side=tk.LEFT, padx=4)
        tk.Button(bottom, text="Next", command=self.next_class).pack(side=tk.LEFT, padx=4)

        self.root.bind("<Left>", lambda _e: self.prev_class())
        self.root.bind("<Right>", lambda _e: self.next_class())
        self.root.bind("n", lambda _e: self.next_class())
        self.root.bind("p", lambda _e: self.prev_class())
        self.root.bind("<Return>", lambda _e: self.save_note())
        self.root.bind("j", lambda _e: self.jump_entry.focus_set())

        self.render_current()

    def current(self) -> ClassInfo:
        return self.classes[self.index]

    def class_dir_names(self, class_id: int) -> list[str]:
        return class_dir_names(class_id)

    def get_reference_paths(self, class_id: int) -> list[Path]:
        return get_reference_paths(self.reference_root, class_id)

    def get_crop_paths(self, class_id: int) -> list[Path]:
        return get_crop_paths(self.crops_root, class_id, self.crop_count, self.rng)

    def render_current(self) -> None:
        try:
            from PIL import ImageTk
        except ImportError as exc:
            raise RuntimeError(
                "PIL.ImageTk is not available. Install Pillow with Tk support or run --mode export."
            ) from exc

        c = self.current()
        ref_paths = self.get_reference_paths(c.class_id)
        crop_paths = self.get_crop_paths(c.class_id)
        image = compose_canvas(c, ref_paths, crop_paths, self.thumb_size)
        self._photo = ImageTk.PhotoImage(image=image)
        self.image_label.configure(image=self._photo)

        note = self.notes.get(str(c.class_id), "")
        self.note_entry.delete(0, tk.END)
        self.note_entry.insert(0, note)
        status = (
            f"[{self.index + 1}/{len(self.classes)}] id={c.class_id}  "
            f"refs={len(ref_paths)}  crops={len(crop_paths)}"
        )
        self.info_var.set(status)

    def save_note(self) -> None:
        c = self.current()
        self.notes[str(c.class_id)] = self.note_entry.get().strip()
        write_notes(self.notes_path, self.notes)
        self.info_var.set(self.info_var.get() + "  | note saved")

    def next_class(self) -> None:
        if self.index < len(self.classes) - 1:
            self.index += 1
            self.render_current()

    def prev_class(self) -> None:
        if self.index > 0:
            self.index -= 1
            self.render_current()

    def jump_to_id(self) -> None:
        raw = self.jump_entry.get().strip()
        if not raw:
            return
        try:
            class_id = int(raw)
        except ValueError:
            self.info_var.set("Jump failed: class id must be an integer")
            return
        for idx, c in enumerate(self.classes):
            if c.class_id == class_id:
                self.index = idx
                self.render_current()
                return
        self.info_var.set(f"Jump failed: class id {class_id} not found")


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    annotations_path = resolve(project_root, args.annotations)
    reference_root = resolve(project_root, args.reference_root)
    crops_root = resolve(project_root, args.crops_root)
    notes_path = resolve(project_root, args.notes_path)
    export_dir = resolve(project_root, args.export_dir)

    classes = load_classes(annotations_path)
    display_available = bool(os.environ.get("DISPLAY"))
    selected_mode = args.mode
    if selected_mode == "auto":
        selected_mode = "gui" if display_available else "export"

    if selected_mode == "export":
        export_review_boards(
            classes=classes,
            reference_root=reference_root,
            crops_root=crops_root,
            notes_path=notes_path,
            export_dir=export_dir,
            crop_count=args.crop_count,
            thumb_size=args.thumb_size,
            seed=args.seed,
        )
        return

    if not display_available:
        raise RuntimeError(
            "GUI mode requested but no DISPLAY is set. "
            "Use --mode export to generate review boards in headless environments."
        )

    root = tk.Tk()
    ReviewerApp(
        root=root,
        classes=classes,
        reference_root=reference_root,
        crops_root=crops_root,
        notes_path=notes_path,
        crop_count=args.crop_count,
        thumb_size=args.thumb_size,
        seed=args.seed,
        start_id=args.start_id,
    )
    root.mainloop()


if __name__ == "__main__":
    main()
