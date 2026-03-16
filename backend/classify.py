"""
Transaction classification constants and helpers.
Extracted from generate_dashboard.py so that backend/ingest.py and
(eventually) generate_dashboard.py can share a single source of truth.
"""

NECESSITY_CATEGORIES = {
    "Rent",
    "Gas & Electric",
    "Internet & Cable",
    "Groceries",
    "Insurance",
    "Medical",
    "Financial & Legal Services",
    "Pets",
    "Gas",
    "Public Transit",
    "Parking & Tolls",
}

OPTIONAL_CATEGORIES = {
    "Restaurants & Bars",
    "Coffee Shops",
    "Entertainment & Recreation",
    "Travel & Vacation",
    "Shopping",
    "Electronics",
    "Miscellaneous",
    "Uncategorized",
    "Taxi & Ride Shares",
    "Cash & ATM",
    "Fitness",
    "Clothing",
}

DEBT_CATEGORIES = {
    "Financial Fees",
    "Student Loans",
    "Loan Repayment",
    "Auto Payment",
}

TRANSFER_CATEGORIES = {"Transfer", "Credit Card Payment"}
INCOME_CATEGORIES   = {"Paychecks"}
CHECKING_KEYWORDS   = ("CHECKING", "SAVINGS")

# ---------------------------------------------------------------------------
# Minimum debt payments (mocked for Phase 3; keys = lowercase account name substrings)
# Phase 4 will replace this with a DB-backed or user-configured source.
# ---------------------------------------------------------------------------

MINIMUM_PAYMENTS: dict[str, float] = {
    "chase sapphire": 150.0,
    "amex":           75.0,
}


def get_minimum_payment_total(n_months: int = 1) -> float:
    """Sum of all minimum payments, scaled by number of months in the period."""
    return sum(MINIMUM_PAYMENTS.values()) * n_months

# Maps the classify() result to the compact Transaction.t code used in data.json
TYPE_CODE = {
    "income":    "I",
    "necessity": "N",
    "optional":  "O",
    "debt":      "D",
    "transfer":  "X",
    "other":     "T",
}


def classify(category: str) -> str:
    """Returns 'income' | 'necessity' | 'optional' | 'debt' | 'transfer' | 'other'."""
    if category in INCOME_CATEGORIES:    return "income"
    if category in TRANSFER_CATEGORIES: return "transfer"
    if category in DEBT_CATEGORIES:     return "debt"
    if category in NECESSITY_CATEGORIES: return "necessity"
    if category in OPTIONAL_CATEGORIES: return "optional"
    return "other"


def is_checking(account_name: str) -> bool:
    return any(k in account_name.upper() for k in CHECKING_KEYWORDS)


def guess_interest_rate(account_name: str) -> float:
    n = account_name.lower()
    if any(k in n for k in ("credit", "card")): return 22.0
    if "student" in n:                           return 5.5
    if any(k in n for k in ("auto", "car")):     return 6.0
    if "personal" in n:                          return 10.0
    if any(k in n for k in ("mortgage", "home")): return 7.0
    return 15.0
