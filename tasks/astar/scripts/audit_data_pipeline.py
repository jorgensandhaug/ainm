import numpy as np
from pathlib import Path
import json

def audit_features(feat_dir: Path):
    print("=== Auditing Features ===")
    files = list(feat_dir.rglob("*.npz"))
    print(f"Found {len(files)} feature files.")
    
    nans = 0
    infinities = 0
    
    for f in files:
        data = np.load(f)
        stack = data['feature_stack']
        names = data['feature_names']
        
        if np.isnan(stack).any():
            nans += 1
            print(f"[!] NaNs found in {f}")
        if np.isinf(stack).any():
            infinities += 1
            print(f"[!] Infinities found in {f}")
            
    print(f"NaN files: {nans}, Inf files: {infinities}")

def audit_evidence(ev_dir: Path):
    print("\n=== Auditing Evidence ===")
    files = list(ev_dir.rglob("*.npz"))
    print(f"Found {len(files)} evidence files.")
    
    anomalies = 0
    for f in files:
        data = np.load(f)
        if 'grid_evidence' in data.files:
            ev = data['grid_evidence']
            # Evidence should be a one-hot or probability array, let's check bounds
            if ev.min() < 0 or ev.max() > 1:
                anomalies += 1
                print(f"[!] Evidence out of bounds in {f}: min={ev.min()}, max={ev.max()}")
        else:
            print(f"[-] No grid_evidence in {f}")
            
    print(f"Evidence files with out-of-bounds probabilities: {anomalies}")

if __name__ == '__main__':
    root = Path('data/derived')
    feat_dir = root / 'features'
    ev_dir = root / 'evidence'
    
    if feat_dir.exists(): audit_features(feat_dir)
    if ev_dir.exists(): audit_evidence(ev_dir)

