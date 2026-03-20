"""Verify SQLModel engine and table creation work correctly."""
import pytest
from sqlmodel import Session, create_engine, SQLModel
from sqlalchemy import inspect

# Must import models so SQLModel metadata is populated before create_all
import backend.models  # noqa: F401


def test_create_all_creates_all_tables():
    """SQLModel.metadata.create_all creates all seven expected tables."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    expected = {
        "retirement_accounts", "routing_targets", "categories",
        "accounts_history", "account_terms", "transactions", "equity_grants",
    }
    assert expected.issubset(tables), f"Missing tables: {expected - tables}"
