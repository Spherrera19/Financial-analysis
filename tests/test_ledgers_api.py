"""Integration tests for the Ledger API endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import backend.models  # noqa: F401 — registers all table=True classes
from backend.main import app
from backend.deps import get_db
from backend.models import Ledger, LedgerAccess, UserProfile


@pytest.fixture()
def client():
    """
    TestClient backed by an isolated in-memory DB.

    Seeded state:
      Profiles : Steven (id=1, primary), Wife (id=2)
      Ledgers  : Household (id=1, joint), Steven Private (id=2, personal),
                 Wife Private (id=3, personal)
      Access   : Steven → Household (admin), Steven → Steven Private (admin)
                 Wife   → Household (admin), Wife   → Wife Private (admin)
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        session.add(UserProfile(id=1, name="Steven", is_primary=True))
        session.add(UserProfile(id=2, name="Wife",   is_primary=False))
        session.add(Ledger(id=1, name="Household",     type="joint"))
        session.add(Ledger(id=2, name="Steven Private", type="personal"))
        session.add(Ledger(id=3, name="Wife Private",   type="personal"))
        session.add(LedgerAccess(user_id=1, ledger_id=1, role="admin"))
        session.add(LedgerAccess(user_id=1, ledger_id=2, role="admin"))
        session.add(LedgerAccess(user_id=2, ledger_id=1, role="admin"))
        session.add(LedgerAccess(user_id=2, ledger_id=3, role="admin"))
        session.commit()

    def override():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── GET /api/ledgers?user_id=X ───────────────────────────────────────────────

def test_get_ledgers_steven_sees_household_and_private(client):
    """Steven can see Household + Steven Private but NOT Wife Private."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    names = {l["name"] for l in r.json()}
    assert names == {"Household", "Steven Private"}
    assert "Wife Private" not in names


def test_get_ledgers_wife_sees_household_and_private(client):
    """Wife can see Household + Wife Private but NOT Steven Private."""
    r = client.get("/api/ledgers?user_id=2")
    assert r.status_code == 200
    names = {l["name"] for l in r.json()}
    assert names == {"Household", "Wife Private"}
    assert "Steven Private" not in names


def test_get_ledgers_response_shape(client):
    """Each ledger entry exposes id, name, type, and members list."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    ledger = r.json()[0]
    assert {"id", "name", "type", "members"} <= set(ledger.keys())
    assert isinstance(ledger["members"], list)


def test_get_ledgers_unknown_user_returns_empty_list(client):
    """A user with no access rows gets [] — not a 404."""
    r = client.get("/api/ledgers?user_id=999")
    assert r.status_code == 200
    assert r.json() == []


# ── POST /api/ledgers ────────────────────────────────────────────────────────

def test_post_creates_business_ledger(client):
    """POST /api/ledgers creates a new business ledger and returns it."""
    r = client.post("/api/ledgers", json={
        "name": "Wedding Photography LLC",
        "type": "business",
        "creator_user_id": 1,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Wedding Photography LLC"
    assert body["type"] == "business"
    assert isinstance(body["id"], int)


def test_post_auto_assigns_creator_as_admin(client):
    """After creating a ledger, the creator can see it via GET /api/ledgers."""
    r = client.post("/api/ledgers", json={
        "name": "Wedding Photography LLC",
        "type": "business",
        "creator_user_id": 1,
    })
    new_id = r.json()["id"]

    steven_ledgers = client.get("/api/ledgers?user_id=1").json()
    assert new_id in {l["id"] for l in steven_ledgers}


def test_post_new_ledger_not_visible_to_other_user(client):
    """A ledger created by Steven is NOT visible to Wife until shared."""
    r = client.post("/api/ledgers", json={
        "name": "Steven Secret LLC",
        "type": "business",
        "creator_user_id": 1,
    })
    new_id = r.json()["id"]

    wife_ledgers = client.get("/api/ledgers?user_id=2").json()
    assert new_id not in {l["id"] for l in wife_ledgers}


def test_post_ledger_invalid_creator_returns_404(client):
    """POST /api/ledgers with a non-existent creator_user_id returns 404."""
    r = client.post("/api/ledgers", json={
        "name": "Ghost LLC",
        "type": "business",
        "creator_user_id": 999,
    })
    assert r.status_code == 404


# ── POST /api/ledgers/{id}/share ─────────────────────────────────────────────

def test_share_grants_viewer_access(client):
    """Sharing Steven Private with Wife makes it appear in her ledger list."""
    r = client.post("/api/ledgers/2/share", json={"user_id": 2, "role": "viewer"})
    assert r.status_code == 200

    wife_ledgers = client.get("/api/ledgers?user_id=2").json()
    assert "Steven Private" in {l["name"] for l in wife_ledgers}


def test_share_response_contains_role(client):
    """Share endpoint returns the new access record including the role."""
    r = client.post("/api/ledgers/2/share", json={"user_id": 2, "role": "viewer"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "viewer"
    assert body["ledger_id"] == 2
    assert body["user_id"] == 2


def test_share_invalid_user_returns_404(client):
    """Sharing with a non-existent user_id returns 404."""
    r = client.post("/api/ledgers/1/share", json={"user_id": 999, "role": "viewer"})
    assert r.status_code == 404


def test_share_invalid_ledger_returns_404(client):
    """Sharing a non-existent ledger returns 404."""
    r = client.post("/api/ledgers/999/share", json={"user_id": 2, "role": "viewer"})
    assert r.status_code == 404


def test_get_ledgers_household_members_embedded(client):
    """Household ledger (id=1) should embed both Steven (admin) and Wife (admin)."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    household = next(l for l in r.json() if l["name"] == "Household")
    member_names = {m["name"] for m in household["members"]}
    member_roles = {m["role"] for m in household["members"]}
    assert member_names == {"Steven", "Wife"}
    assert member_roles == {"admin"}


def test_get_ledgers_private_ledger_has_one_member(client):
    """Steven Private should list only Steven as a member."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    private = next(l for l in r.json() if l["name"] == "Steven Private")
    assert len(private["members"]) == 1
    assert private["members"][0]["name"] == "Steven"
    assert private["members"][0]["role"] == "admin"


def test_get_ledgers_member_fields(client):
    """Every member object in every ledger must have exactly {user_id, name, role} keys."""
    r = client.get("/api/ledgers?user_id=1")
    assert r.status_code == 200
    for ledger in r.json():
        for member in ledger["members"]:
            assert set(member.keys()) == {"user_id", "name", "role"}
