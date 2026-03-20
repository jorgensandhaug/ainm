from ultralytics import YOLO
from pathlib import Path
import torch


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model = YOLO("yolo26x.pt")
    model.train(
        data=str(root / "data" / "yolo" / "data.yaml"),
        single_cls=False,
        project=str(root / "runs"),
        name="cls",
        device=device,
    )


if __name__ == "__main__":
    main()
