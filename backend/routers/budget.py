"""Budget routes: /api/routing, /api/categories, /api/categories/progress."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from sqlalchemy import text

from backend.deps import get_db
from backend.models import (
    Category, CategoryCreate, CategoryUpdate,
    RoutingTarget, RoutingUpdate,
)

router = APIRouter()


# ── Routing ──────────────────────────────────────────────────────────────────

@router.get("/api/routing")
def get_routing(session: Session = Depends(get_db)) -> JSONResponse:
    """Return all routing targets ordered by priority then name."""
    targets = session.exec(
        select(RoutingTarget).order_by(RoutingTarget.priority, RoutingTarget.name)
    ).all()
    return JSONResponse(content=[t.model_dump() for t in targets])


@router.put("/api/routing")
def save_routing(
    body: RoutingUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Full replace of routing_targets.
    DELETE all + bulk INSERT. Frontend refetches GET /api/routing to get new IDs.
    """
    if not body.targets:
        raise HTTPException(status_code=400, detail="targets list must not be empty.")

    session.execute(text("DELETE FROM routing_targets"))
    for t in body.targets:
        session.add(RoutingTarget(
            name=t.name,
            monthly_amount=t.monthly_amount,
            category=t.category,
            priority=t.priority,
        ))
    session.commit()
    return JSONResponse(content={"saved": len(body.targets)})


# ── Categories ───────────────────────────────────────────────────────────────

@router.get("/api/categories")
def get_categories(
    ledger_id: int | None = Query(default=None, description="Scope to a specific ledger workspace."),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Return categories ordered alphabetically, optionally filtered by ledger."""
    stmt = select(Category).order_by(Category.name)
    if ledger_id is not None:
        stmt = stmt.where(Category.ledger_id == ledger_id)
    cats = session.exec(stmt).all()
    return JSONResponse(content=[{"id": c.id, "name": c.name, "monthly_budget": c.monthly_budget, "ledger_id": c.ledger_id} for c in cats])


@router.get("/api/categories/progress")
def get_categories_progress(
    ledger_id: int | None = Query(default=None, description="Scope to a specific ledger workspace."),
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Return budgeted categories (monthly_budget > 0) with actual spending
    summed for the current calendar month.

    Pass ?ledger_id=<id> to restrict both categories and their spending to one workspace.
    The ledger_id value is always bound as a named parameter — never interpolated.
    """
    # Build optional WHERE / JOIN clauses. The literal strings contain only the
    # placeholder name (:lid), never the value itself — SQL injection is not possible.
    cat_lid_clause = "AND c.ledger_id = :lid" if ledger_id is not None else ""
    tx_lid_clause  = "AND t.ledger_id = :lid" if ledger_id is not None else ""
    params         = {"lid": ledger_id} if ledger_id is not None else {}

    rows = session.execute(text(f"""
        SELECT
            c.name,
            c.monthly_budget,
            COALESCE(
                SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END),
                0
            ) AS current_spend
        FROM categories c
        LEFT JOIN transactions t
            ON  t.category = c.name
            AND strftime('%Y-%m', t.date) = strftime('%Y-%m', 'now')
            AND t.type NOT IN ('I', 'X')
            {tx_lid_clause}
        WHERE c.monthly_budget > 0
            {cat_lid_clause}
        GROUP BY c.id, c.name, c.monthly_budget
        ORDER BY c.name ASC
    """), params).mappings().all()
    return JSONResponse(content=[dict(r) for r in rows])


@router.post("/api/categories")
def create_category(
    body: CategoryCreate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """Create a new category. Returns 409 if the name already exists."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name must not be empty.")
    existing = session.exec(select(Category).where(Category.name == name)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{name}' already exists.")
    cat = Category(name=name, monthly_budget=body.monthly_budget, ledger_id=body.ledger_id)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return JSONResponse(
        status_code=201,
        content={"id": cat.id, "name": cat.name, "monthly_budget": cat.monthly_budget, "ledger_id": cat.ledger_id},
    )


@router.put("/api/categories/{category_id}")
def update_category(
    category_id: int,
    body: CategoryUpdate,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Update a category's name and/or monthly_budget.
    Cascades a rename to all matching transaction rows atomically.
    """
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name   = cat.name
    new_name   = body.name.strip() if body.name is not None else old_name
    new_budget = body.monthly_budget if body.monthly_budget is not None else cat.monthly_budget

    if new_name != old_name:
        conflict = session.exec(
            select(Category).where(Category.name == new_name, Category.id != category_id)
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail=f"Category '{new_name}' already exists.")
        # Cascade rename to transaction history
        session.execute(
            text("UPDATE transactions SET category = :new WHERE category = :old"),
            {"new": new_name, "old": old_name},
        )

    cat.name = new_name
    cat.monthly_budget = new_budget
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return JSONResponse(content={"id": cat.id, "name": cat.name, "monthly_budget": cat.monthly_budget})


@router.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    session: Session = Depends(get_db),
) -> JSONResponse:
    """
    Delete a category. Cascades all matching transactions to 'Uncategorized'.
    """
    cat = session.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name = cat.name

    # Ensure 'Uncategorized' exists before cascading
    session.execute(text("INSERT OR IGNORE INTO categories (name) VALUES ('Uncategorized')"))
    # Cascade transactions
    session.execute(
        text("UPDATE transactions SET category = 'Uncategorized' WHERE category = :old"),
        {"old": old_name},
    )
    session.delete(cat)
    session.commit()
    return JSONResponse(content={"deleted": old_name})
