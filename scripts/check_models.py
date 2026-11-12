"""Check checkpoint compatibility and two notebook reference predictions."""

from __future__ import annotations

import resource
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np

from app.forecast import catalog, historical_data, load_model, predict


def main() -> None:
    data = historical_data()
    if not (data["hour"].to_numpy() == data["timestamp"].dt.hour.to_numpy()).all():
        raise AssertionError("Source hour column differs from the timestamps")
    if not (data["day_of_week"].to_numpy() == data["timestamp"].dt.day_of_week.to_numpy()).all():
        raise AssertionError("Source weekday column differs from the timestamps")

    specs = catalog()
    checked = 0
    for spec in specs:
        if not spec.supported:
            continue
        history = data.iloc[-spec.horizon - spec.lookback:-spec.horizon][
            ["timestamp", "building_power"]
        ]
        result = predict(spec, history)
        if len(result) != spec.horizon or not np.isfinite(result["forecast"]).all():
            raise AssertionError(f"Invalid output from {spec.file}")
        checked += 1

    start = int(0.8 * len(data))
    reference_history = data.iloc[start:start + 8][["timestamp", "building_power"]]
    references = {"ct": 9095.714, "lstm": 8856.61}
    for family, expected in references.items():
        spec = next(s for s in specs if s.family == family and s.lookback == 8
                    and s.horizon == 5 and (s.epochs == 200 if family == "ct" else s.epochs == 60))
        actual = float(predict(spec, reference_history)["forecast"].iloc[0])
        if abs(actual - expected) > 2.0:
            raise AssertionError(f"{family} reference mismatch: {actual:.3f} vs {expected:.3f}")

    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"Verified {checked}/{len(specs)} checkpoint configurations")
    print("CNN–Transformer and CNN–LSTM reference predictions match")
    print(f"Model cache: {load_model.cache_info()}")
    print(f"Peak RSS: {peak_mb:.1f} MB")


if __name__ == "__main__":
    main()
