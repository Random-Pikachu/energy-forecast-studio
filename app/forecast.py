"""Bounded-memory inference for the trained hourly forecasting models."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "models" / "catalog.json"
DATA_PATH = ROOT / "data" / "building_multivariate.csv"
SCALER_PATH = ROOT / "data" / "scalers.json"
FEATURE_COLUMNS = ("building_power", "hour", "day_of_week")

@dataclass(frozen=True)
class ModelSpec:
    family: str
    lookback: int
    horizon: int
    file: str
    drive_id: str
    size: int
    epochs: int | None = None
    metadata_id: str | None = None
    supported: bool = True
    issue: str | None = None

    @property
    def path(self) -> Path:
        return ROOT / "models" / self.file

    @property
    def label(self) -> str:
        suffix = f" · {self.epochs} epochs" if self.epochs is not None else ""
        return f"{self.lookback}h history → {self.horizon}h forecast{suffix}"


@lru_cache(maxsize=1)
def catalog() -> tuple[ModelSpec, ...]:
    return tuple(ModelSpec(**item) for item in json.loads(CATALOG_PATH.read_text()))


@lru_cache(maxsize=1)
def historical_data() -> pd.DataFrame:
    frame = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
    frame = frame.sort_values("timestamp").reset_index(drop=True)
    if frame["timestamp"].isna().any() or frame["building_power"].isna().any():
        raise ValueError("The reference dataset contains missing timestamps or power values.")
    if not frame["timestamp"].diff().iloc[1:].eq(pd.Timedelta(hours=1)).all():
        raise ValueError("The reference dataset must contain uninterrupted hourly readings.")
    return frame


@lru_cache(maxsize=1)
def scaler_parameters() -> dict:
    return json.loads(SCALER_PATH.read_text())


def validate_history(history: pd.DataFrame, lookback: int) -> pd.DataFrame:
    if not {"timestamp", "building_power"}.issubset(history.columns):
        raise ValueError("History needs timestamp and building_power columns.")
    values = history[["timestamp", "building_power"]].copy()
    values["timestamp"] = pd.to_datetime(values["timestamp"], errors="coerce")
    values["building_power"] = pd.to_numeric(values["building_power"], errors="coerce")
    if values.isna().any().any():
        raise ValueError("History contains invalid timestamps or power readings.")
    values = values.sort_values("timestamp").reset_index(drop=True)
    if values["timestamp"].duplicated().any():
        raise ValueError("History contains duplicate timestamps.")
    if len(values) < lookback:
        raise ValueError(f"This model needs at least {lookback} consecutive hourly readings.")
    values = values.tail(lookback).reset_index(drop=True)
    if not values["timestamp"].diff().iloc[1:].eq(pd.Timedelta(hours=1)).all():
        raise ValueError("The last lookback readings must be exactly one hour apart.")
    if not np.isfinite(values["building_power"].to_numpy(dtype=float)).all():
        raise ValueError("History contains non-finite power readings.")
    return values


def _build_model(spec: ModelSpec, state: dict) -> torch.nn.Module:
    from app.architectures import CNNGRU, CNNLSTM, CNNTransformer

    if spec.family == "ct":
        conv = state["temporal_encoder.branches.0.weight"]
        kernels = tuple(
            state[f"temporal_encoder.branches.{i}.weight"].shape[-1]
            for i in range(4)
        )
        return CNNTransformer(
            input_size=conv.shape[1], horizon=spec.horizon,
            kernel_sizes=kernels, branch_channels=conv.shape[0],
            d_model=state["head.weight"].shape[1], nhead=4,
            num_layers=len({k.split(".")[2] for k in state if k.startswith("transformer_encoder.layers.")}),
            dim_feedforward=state["fusion.feed_forward.0.weight"].shape[0],
            dropout=0.1,
        )
    if spec.family == "lstm":
        conv = state["conv1.weight"]
        return CNNLSTM(
            input_size=conv.shape[1], horizon=spec.horizon,
            hidden_size=state["lstm.weight_hh_l0"].shape[1],
            cnn_channels=conv.shape[0], kernel_size=conv.shape[2],
        )
    if spec.family == "gru":
        conv = state["conv1d.weight"]
        layers = len([k for k in state if k.startswith("gru.weight_ih_l")])
        return CNNGRU(
            input_size=conv.shape[1], horizon=spec.horizon,
            hidden_size=state["gru.weight_hh_l0"].shape[1],
            cnn_channels=conv.shape[0], kernel_size=conv.shape[2],
            num_layers=layers,
        )
    raise ValueError(f"Unknown model family: {spec.family}")


@lru_cache(maxsize=1)
def load_model(spec: ModelSpec) -> torch.nn.Module:
    import torch

    torch.set_num_threads(min(2, torch.get_num_threads()))
    if not spec.path.is_file():
        raise FileNotFoundError(f"Missing model checkpoint: {spec.path.name}")
    state = torch.load(spec.path, map_location="cpu", weights_only=True)
    model = _build_model(spec, state)
    model.load_state_dict(state, strict=True)
    del state
    return model.eval()


def predict(spec: ModelSpec, history: pd.DataFrame) -> pd.DataFrame:
    import torch

    history = validate_history(history, spec.lookback)
    stats = scaler_parameters()
    features = np.column_stack([
        history["building_power"].to_numpy(dtype=np.float64),
        history["timestamp"].dt.hour.to_numpy(dtype=np.float64),
        history["timestamp"].dt.day_of_week.to_numpy(dtype=np.float64),
    ])
    scaled = ((features - np.asarray(stats["feature_mean"])) /
              np.asarray(stats["feature_scale"])).astype(np.float32)
    with torch.inference_mode():
        normalized = load_model(spec)(torch.from_numpy(scaled[None]))
        forecast = normalized.squeeze(0).numpy().astype(np.float64)
    forecast = forecast * stats["target_scale"] + stats["target_mean"]
    times = pd.date_range(
        history["timestamp"].iloc[-1] + pd.Timedelta(hours=1),
        periods=spec.horizon, freq="h",
    )
    return pd.DataFrame({"timestamp": times, "forecast": forecast})
