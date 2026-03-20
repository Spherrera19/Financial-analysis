"""System routes: POST /api/upload/csv, GET /api/logs."""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from backend.deps import get_raw_db, DIR, DB_PATH
from backend.equity_engine import parse_brokerage_csv
from backend.ingest import build_database
from backend.logger import LOG_FILE

router = APIRouter()

_FINANCE_PREFIXES = ("Transactions", "Balances")
_EQUITY_PREFIXES  = ("Equity", "RSU")
_VALID_PREFIXES   = _FINANCE_PREFIXES + _EQUITY_PREFIXES


@router.post("/api/upload/csv")
async def upload_csv(
    files: list[UploadFile] = File(...),
    conn: sqlite3.Connection = Depends(get_raw_db),
) -> JSONResponse:
    """
    Accept one or more CSV files and route them by filename prefix.

    Finance exports (Transactions_*.csv, Balances_*.csv):
      - Delete existing files for that prefix from the project root.
      - Save the new file, then rebuild SQLite from all CSVs.

    Equity exports (Equity_*.csv, RSU_*.csv):
      - Parse grant tranches from the CSV using parse_brokerage_csv().
      - For each unique ticker found: DELETE existing rows where
        source = 'brokerage_csv', then INSERT the new grants.
      - Manual grants (source = 'manual') are never touched.

    Returns {"uploaded": [...filenames], "count": N, "grants_imported": M}
    where grants_imported is present only when equity files were processed.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    finance_uploads: list[UploadFile] = []
    equity_uploads:  list[UploadFile] = []

    for upload in files:
        filename = upload.filename or ""
        if any(filename.startswith(p) for p in _EQUITY_PREFIXES):
            equity_uploads.append(upload)
        elif any(filename.startswith(p) for p in _FINANCE_PREFIXES):
            finance_uploads.append(upload)
        else:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"'{filename}' is not a recognised export. "
                    f"Expected a filename starting with one of: "
                    f"{', '.join(_VALID_PREFIXES)}."
                ),
            )

    saved_finance: list[str] = []
    saved_equity:  list[str] = []
    grants_imported = 0

    # ── Finance files: save to disk, rebuild SQLite ──────────────────────────
    for upload in finance_uploads:
        filename = upload.filename or ""
        prefix = next(p for p in _FINANCE_PREFIXES if filename.startswith(p))
        for old in DIR.glob(f"{prefix}*.csv"):
            old.unlink()
        dest = DIR / filename
        content = await upload.read()
        dest.write_bytes(content)
        saved_finance.append(filename)

    if saved_finance:
        rebuilt = build_database(DB_PATH, DIR)
        rebuilt.close()
        # sync_categories_from_transactions is already called inside build_database()

    # ── Equity files: parse → per-ticker upsert ───────────────────────────────
    for upload in equity_uploads:
        filename = upload.filename or ""
        content = await upload.read()

        # Write to a temp file so parse_brokerage_csv can open it normally
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".csv")
        try:
            os.write(tmp_fd, content)
            os.close(tmp_fd)
            grants = parse_brokerage_csv(tmp_path)
        finally:
            os.unlink(tmp_path)

        # Per-ticker upsert: only brokerage_csv rows are replaced
        tickers = {g["ticker"] for g in grants}
        for ticker in tickers:
            conn.execute(
                "DELETE FROM equity_grants WHERE ticker = ? AND source = 'brokerage_csv'",
                (ticker,),
            )

        for grant in grants:
            conn.execute(
                """
                INSERT INTO equity_grants
                    (ticker, grant_date, total_shares, vesting_schedule, source)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    grant["ticker"],
                    grant["grant_date"],
                    grant["total_shares"],
                    json.dumps(grant["vesting_schedule"]),
                    grant["source"],
                ),
            )

        conn.commit()
        grants_imported += len(grants)
        saved_equity.append(filename)

    all_uploaded = saved_finance + saved_equity
    result: dict = {"uploaded": all_uploaded, "count": len(all_uploaded)}
    if saved_equity:
        result["grants_imported"] = grants_imported

    return JSONResponse(content=result)


@router.get("/api/logs")
def get_logs(lines: int = 200) -> JSONResponse:
    """
    Return the last `lines` lines of logs/app.log.
    Returns {"lines": [...], "total": <total_line_count>}.
    """
    if not LOG_FILE.exists():
        return JSONResponse(content={"lines": [], "total": 0})

    with LOG_FILE.open("r", encoding="utf-8", errors="replace") as f:
        all_lines = f.readlines()

    tail = [line.rstrip() for line in all_lines[-lines:]]
    return JSONResponse(content={"lines": tail, "total": len(all_lines)})
