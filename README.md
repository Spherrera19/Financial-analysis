# Finance Dashboard

A full-stack personal finance and wealth-tracking dashboard. It ingests CSV exports from banks and brokerages, categorizes transactions, projects debt payoff scenarios, tracks equity vesting, and visualizes cash flow.

## 🚀 Tech Stack

**Frontend (Modernized SPA):**
* React 19 + TypeScript + Vite
* React Router v7 (Client-side routing)
* React Query v5 (Data fetching & caching)
* Tailwind CSS + Framer Motion (Styling & Animations)
* Chart.js + react-chartjs-2 (Data Visualization)

**Backend (Live API & Database):**
* FastAPI (RESTful API Wrapper)
* SQLite (Local database: `finance.db`)
* SQLModel & SQLAlchemy 2.0 (ORM)
* Alembic (Database migrations)
* pydantic-settings (Environment configuration)
* Pandas & yfinance (Data processing & live stock quotes)

---

## 🛠️ How to Run (Local Development)

The easiest way to boot the entire stack on Windows is using the provided start script:

```bash
# Double-click or run from the terminal:
start.bat
```

This script will automatically:

- Boot the FastAPI backend on http://localhost:8000
- Boot the Vite frontend on http://localhost:5173 (with strict port enforcement)

### Running Manually

If you prefer to start the servers manually or are not on Windows:

**1. Start the Backend API**

```bash
# Ensure your virtual environment is active
call venv\Scripts\activate  # Windows
source venv/bin/activate    # Mac/Linux

uvicorn backend.main:app --reload --port 8000
```

> Note: On its first run, FastAPI will automatically use Alembic to create the database schema and run `backend/seeds.py` to populate your isolated ledgers.

**2. Start the Frontend**

```bash
cd frontend
npm run dev -- --port 5173 --strictPort
```

---

## ⚙️ Configuration (CORS)

The backend is secured by default to only accept traffic from localhost. If you need to access the dashboard from another device on your network, or if Vite bumps you to a different port, you can override the CORS configuration.

Create a `.env` file in the root of the project:

```
CORS_ORIGINS='["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]'
```

---

## 📊 Features

- **Isolated Workspaces (Ledgers):** Manage multiple financial profiles (e.g., Personal, Joint, Business) with separate database scoping.
- **Cash Flow Sankey:** Interactive, multi-period visualization of exactly where your money flows from income down to net savings.
- **Debt Snowball/Avalanche Forecaster:** Live calculation of payoff dates and interest saved based on minimum payments and extra allocated cash.
- **Equity Vesting Projections:** Pulls live market data via yfinance to project the future value of upcoming RSU grants using Geometric Brownian Motion (GBM).
- **Interactive Guided Tour:** Built-in DOM-polling onboarding tour to explain dashboard metrics to new users.

---

## 🗄️ Database Migrations

If you update the SQLModel tables in `backend/models/`, you must generate a new Alembic migration:

```bash
alembic revision --autogenerate -m "description of changes"
alembic upgrade head
```
