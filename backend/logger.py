"""
Centralised logging for the Finance Dashboard backend.

Usage:
    from backend.logger import get_logger, LOG_FILE
    log = get_logger(__name__)
    log.info("Server started")
"""
from __future__ import annotations

import logging
import logging.handlers
from pathlib import Path

# logs/ lives at the project root, one level above the backend/ package
LOG_DIR  = Path(__file__).parent.parent / "logs"
LOG_FILE = LOG_DIR / "app.log"

_FMT      = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s"
_DATE_FMT = "%Y-%m-%dT%H:%M:%S"


def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger wired to a rotating file handler and stdout.
    Safe to call multiple times — handlers are only attached once per name.
    """
    logger = logging.getLogger(name)

    if logger.handlers:          # already configured in this process
        return logger

    logger.setLevel(logging.DEBUG)
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    fmt = logging.Formatter(_FMT, datefmt=_DATE_FMT)

    # ── Rotating file: 10 MB per file, keep 5 backups ───────────────────────
    fh = logging.handlers.RotatingFileHandler(
        LOG_FILE,
        maxBytes=10 * 1_024 * 1_024,
        backupCount=5,
        encoding="utf-8",
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    # ── Console: INFO and above ──────────────────────────────────────────────
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    return logger
