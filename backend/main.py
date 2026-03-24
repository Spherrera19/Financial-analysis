"""
Phase 4 — FastAPI Backend Wrapper
===================================
Wraps the existing engine + Pydantic pipeline into a live local API.

Run via start.bat or manually:
    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import time
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from backend.logger import get_logger
from backend.database import create_db_tables, init_db, DB_PATH
from backend.seeds import run_seeds
from backend.config import settings

log = get_logger("api")

from backend.routers import dashboard, budget, equity, debt, settings as settings_router, transactions, retirement, tax, profiles, incomes, ledgers


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_tables()          # ensure all SQLModel tables exist
    conn = init_db(DB_PATH)
    try:
        run_seeds(conn)         # insert default rows if tables are empty
    finally:
        conn.close()
    yield


app = FastAPI(title="Finance Dashboard API", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Middleware — Order is CRITICAL. Last added = Outermost layer.
# ---------------------------------------------------------------------------

class _RequestLogMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status code, and elapsed time."""
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1_000
        log.info(
            "%s %s → %s  (%.1f ms)",
            request.method,
            request.url.path,
            response.status_code,
            ms,
        )
        return response

# 1. Add Logging Middleware FIRST (so it sits on the inside)
app.add_middleware(_RequestLogMiddleware)

# 2. Add CORS Middleware LAST (so it sits on the absolute outside)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Global exception handler — logs full traceback, returns clean JSON
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    log.error(
        "Unhandled exception on %s %s\n%s",
        request.method,
        request.url.path,
        tb,
    )
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
    )


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(dashboard.router)
app.include_router(budget.router)
app.include_router(equity.router)
app.include_router(debt.router)
app.include_router(settings_router.router)
app.include_router(transactions.router)
app.include_router(retirement.router)
app.include_router(tax.router)
app.include_router(profiles.router)
app.include_router(incomes.router)
app.include_router(ledgers.router)
