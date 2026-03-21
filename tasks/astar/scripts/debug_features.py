import numpy as np
import sys
from pathlib import Path

def debug_file(path):
    print(f"File: {path}")
    data = np.load(path)
    for key in data.files:
        arr = data[key]
        if arr.dtype.kind in ('i', 'f', 'u'):
            print(f"  {key}: shape={arr.shape}, dtype={arr.dtype}, min={arr.min()}, max={arr.max()}, mean={arr.mean():.4f}, NaNs={np.isnan(arr).sum()}")
        else:
            print(f"  {key}: shape={arr.shape}, dtype={arr.dtype}, value={arr}")

if __name__ == '__main__':
    p = Path(sys.argv[1])
    debug_file(p)
