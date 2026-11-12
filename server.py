"""Local API and static server for the React forecasting dashboard."""

from __future__ import annotations

import csv
import io
import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import pandas as pd

from app.forecast import catalog, historical_data, predict, validate_history

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "frontend" / "dist"
MAX_REQUEST_BYTES = 2_500_000


def model_id(spec) -> str:
    suffix = f"-e{spec.epochs}" if spec.epochs is not None else ""
    return f"{spec.family}-lb{spec.lookback}-h{spec.horizon}{suffix}"


def available_models() -> dict:
    return {model_id(spec): spec for spec in catalog() if spec.supported and spec.path.is_file()}


def record(timestamp, **values) -> dict:
    return {"timestamp": pd.Timestamp(timestamp).strftime("%Y-%m-%dT%H:%M:%S"), **values}


def configuration_bounds(spec, data: pd.DataFrame) -> tuple[pd.Timestamp, pd.Timestamp]:
    return data["timestamp"].iloc[spec.lookback - 1], data["timestamp"].iloc[len(data) - spec.horizon - 1]


def select_history(spec, at: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = historical_data()
    try:
        chosen = pd.Timestamp(at)
    except (ValueError, TypeError) as exc:
        raise ValueError("Choose a valid date and hour.") from exc
    if chosen.tzinfo is not None or chosen.minute or chosen.second or chosen.microsecond:
        raise ValueError("Choose an exact hour in the dataset's local time.")
    positions = data.index[data["timestamp"] == chosen]
    if len(positions) != 1:
        raise ValueError("That hour is not in the reference dataset.")
    index = int(positions[0])
    if index < spec.lookback - 1 or index + spec.horizon >= len(data):
        first, last = configuration_bounds(spec, data)
        raise ValueError(f"Choose an hour between {first} and {last} for this configuration.")
    history = data.iloc[index - spec.lookback + 1:index + 1][["timestamp", "building_power"]].copy()
    actual = data.iloc[index + 1:index + 1 + spec.horizon][["timestamp", "building_power"]].copy()
    return history, actual


def catalog_payload() -> dict:
    data = historical_data()
    models = available_models()
    options = []
    for key, spec in models.items():
        first, last = configuration_bounds(spec, data)
        options.append({
            "id": key,
            "family": spec.family,
            "lookback": spec.lookback,
            "horizon": spec.horizon,
            "epochs": spec.epochs,
            "firstAt": record(first)["timestamp"],
            "lastAt": record(last)["timestamp"],
        })
    return {
        "models": options,
        "savedCheckpoints": len(catalog()),
        "usableConfigurations": len(options),
        "datasetRows": len(data),
        "datasetStart": record(data["timestamp"].iloc[0])["timestamp"],
        "datasetEnd": record(data["timestamp"].iloc[-1])["timestamp"],
    }


def history_payload(spec, at: str) -> dict:
    history, actual = select_history(spec, at)
    return {
        "history": [record(row.timestamp, building_power=float(row.building_power)) for row in history.itertuples()],
        "actual": [record(row.timestamp, actual=float(row.building_power)) for row in actual.itertuples()],
    }


def forecast_payload(body: dict) -> dict:
    if not isinstance(body, dict):
        raise ValueError("The request must be a JSON object.")
    spec = available_models().get(body.get("modelId"))
    if spec is None:
        raise ValueError("Choose an available model configuration.")
    mode = body.get("mode")
    actual = None
    if mode == "historical":
        history, actual = select_history(spec, body.get("at"))
        edits = body.get("history")
        if edits is not None:
            if not isinstance(edits, list) or len(edits) != spec.lookback:
                raise ValueError(f"Provide exactly {spec.lookback} past readings.")
            edited = pd.DataFrame(edits)
            edited = validate_history(edited, spec.lookback)
            if not edited["timestamp"].reset_index(drop=True).equals(history["timestamp"].reset_index(drop=True)):
                raise ValueError("Keep the historical timestamps unchanged when editing power values.")
            history = edited
    elif mode == "upload":
        raw = body.get("csvText")
        if not isinstance(raw, str) or not raw.strip():
            raise ValueError("Upload a CSV containing timestamp and building_power columns.")
        if len(raw.encode("utf-8")) > 2_000_000:
            raise ValueError("The CSV must be smaller than 2 MB.")
        reader = csv.DictReader(io.StringIO(raw.lstrip("\ufeff")))
        if reader.fieldnames:
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
        if not reader.fieldnames or not {"timestamp", "building_power"}.issubset(reader.fieldnames):
            raise ValueError("CSV columns must include timestamp and building_power.")
        rows = [{"timestamp": row["timestamp"], "building_power": row["building_power"]} for row in reader]
        history = validate_history(pd.DataFrame(rows), spec.lookback)
    else:
        raise ValueError("Choose historical replay or CSV upload.")

    forecast = predict(spec, history)
    result = [record(row.timestamp, forecast=float(row.forecast)) for row in forecast.itertuples()]
    response = {
        "modelId": model_id(spec),
        "history": [record(row.timestamp, building_power=float(row.building_power)) for row in history.itertuples()],
        "forecast": result,
        "actual": None,
        "metrics": None,
        "hasNegativeForecast": bool((forecast["forecast"] < 0).any()),
    }
    if actual is not None:
        response["actual"] = [record(row.timestamp, actual=float(row.building_power)) for row in actual.itertuples()]
        errors = forecast["forecast"].to_numpy() - actual["building_power"].to_numpy()
        response["metrics"] = {
            "mae": float(np.mean(np.abs(errors))),
            "rmse": float(np.sqrt(np.mean(errors ** 2))),
        }
    return response


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/catalog":
                return self.send_json(catalog_payload())
            if parsed.path == "/api/history":
                params = parse_qs(parsed.query)
                spec = available_models().get(params.get("modelId", [None])[0])
                if spec is None:
                    raise ValueError("Choose an available model configuration.")
                return self.send_json(history_payload(spec, params.get("at", [None])[0]))
            if parsed.path.startswith("/api/"):
                return self.send_json({"error": "Endpoint not found."}, HTTPStatus.NOT_FOUND)
        except (ValueError, KeyError) as exc:
            return self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        if not DIST.joinpath("index.html").is_file():
            return self.send_json({"error": "Frontend not built. Run npm run build in frontend/."}, HTTPStatus.SERVICE_UNAVAILABLE)
        return super().do_GET()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/forecast":
            return self.send_json({"error": "Endpoint not found."}, HTTPStatus.NOT_FOUND)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                return self.send_json({"error": "Request is too large or empty."}, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            body = json.loads(self.rfile.read(length))
            return self.send_json(forecast_payload(body))
        except (ValueError, KeyError, json.JSONDecodeError) as exc:
            return self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except (FileNotFoundError, RuntimeError) as exc:
            return self.send_json({"error": f"Inference failed: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)


def main() -> None:
    port = int(os.environ.get("PORT", os.environ.get("IOTBDM_PORT", "8000")))
    host = os.environ.get("IOTBDM_HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Energy Forecast is ready at http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
