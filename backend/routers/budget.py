"""Budget routes: /api/routing, /api/categories, /api/categories/progress."""
from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from backend.deps import get_db
from backend.models import CategoryCreate, CategoryRow, CategoryUpdate, RoutingTarget, RoutingUpdate

router = APIRouter()


@router.get("/api/routing")
def get_routing(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """Return all routing targets ordered by priority then name."""
    rows = conn.execute(
        "SELECT id, name, monthly_amount, category, priority "
        "FROM routing_targets ORDER BY priority ASC, name ASC"
    ).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])


@router.put("/api/routing")
def save_routing(
    body: RoutingUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Full replace of routing_targets.
    Wrapped in a single transaction: DELETE + reset autoincrement + bulk INSERT.
    Frontend must refetch GET /api/routing after success to get new IDs.
    """
    if not body.targets:
        raise HTTPException(status_code=400, detail="targets list must not be empty.")

    conn.execute("DELETE FROM routing_targets")
    conn.execute("DELETE FROM sqlite_sequence WHERE name='routing_targets'")
    conn.executemany(
        "INSERT INTO routing_targets (name, monthly_amount, category, priority) "
        "VALUES (?, ?, ?, ?)",
        [(t.name, t.monthly_amount, t.category, t.priority) for t in body.targets],
    )
    conn.commit()
    return JSONResponse(content={"saved": len(body.targets)})


@router.get("/api/categories")
def get_categories(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """Return all categories ordered alphabetically."""
    rows = conn.execute(
        "SELECT id, name, monthly_budget FROM categories ORDER BY name ASC"
    ).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])


@router.get("/api/categories/progress")
def get_categories_progress(conn: sqlite3.Connection = Depends(get_db)) -> JSONResponse:
    """
    Return budgeted categories (monthly_budget > 0) with actual spending
    summed for the current calendar month.  Excludes income (type='I') and
    internal transfers (type='X') from the spend total.
    """
    rows = conn.execute(
        """
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
        WHERE c.monthly_budget > 0
        GROUP BY c.id, c.name, c.monthly_budget
        ORDER BY c.name ASC
        """
    ).fetchall()
    return JSONResponse(content=[dict(r) for r in rows])


@router.post("/api/categories")
def create_category(
    body: CategoryCreate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """Create a new category. Returns 409 if the name already exists."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Category name must not be empty.")
    existing = conn.execute(
        "SELECT id FROM categories WHERE name = ?", (name,)
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{name}' already exists.")
    cursor = conn.execute(
        "INSERT INTO categories (name, monthly_budget) VALUES (?, ?)",
        (name, body.monthly_budget),
    )
    conn.commit()
    return JSONResponse(
        status_code=201,
        content={"id": cursor.lastrowid, "name": name, "monthly_budget": body.monthly_budget},
    )


@router.put("/api/categories/{category_id}")
def update_category(
    category_id: int,
    body: CategoryUpdate,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Update a category's name and/or monthly_budget.
    If the name changes, cascades the rename to all matching transaction rows
    atomically.  Returns 409 if the new name already exists.
    """
    row = conn.execute(
        "SELECT id, name, monthly_budget FROM categories WHERE id = ?", (category_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name   = row["name"]
    new_name   = body.name.strip() if body.name is not None else old_name
    new_budget = body.monthly_budget if body.monthly_budget is not None else row["monthly_budget"]

    if new_name != old_name:
        # Conflict check
        conflict = conn.execute(
            "SELECT id FROM categories WHERE name = ? AND id != ?", (new_name, category_id)
        ).fetchone()
        if conflict:
            raise HTTPException(
                status_code=409, detail=f"Category '{new_name}' already exists."
            )
        # Cascade rename to transaction history
        conn.execute(
            "UPDATE transactions SET category = ? WHERE category = ?", (new_name, old_name)
        )

    conn.execute(
        "UPDATE categories SET name = ?, monthly_budget = ? WHERE id = ?",
        (new_name, new_budget, category_id),
    )
    conn.commit()
    return JSONResponse(content={"id": category_id, "name": new_name, "monthly_budget": new_budget})


@router.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    conn: sqlite3.Connection = Depends(get_db),
) -> JSONResponse:
    """
    Delete a category.  Cascades all matching transactions to 'Uncategorized'.
    Ensures 'Uncategorized' exists before the cascade.
    """
    row = conn.execute(
        "SELECT name FROM categories WHERE id = ?", (category_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Category {category_id} not found.")

    old_name = row["name"]

    # Ensure 'Uncategorized' exists before cascading
    conn.execute(
        "INSERT OR IGNORE INTO categories (name) VALUES ('Uncategorized')"
    )
    # Cascade transactions
    conn.execute(
        "UPDATE transactions SET category = 'Uncategorized' WHERE category = ?", (old_name,)
    )
    # Delete the category
    conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    conn.commit()
    return JSONResponse(content={"deleted": old_name})
