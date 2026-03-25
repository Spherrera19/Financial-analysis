@echo off
echo ============================================
echo  Finance Dashboard — Live Dev Mode
echo  Requires: refresh.bat run at least once
echo            to populate finance.db
echo ============================================
echo.

echo Starting FastAPI backend on http://localhost:8000 ...
start "Finance API" cmd /k "call venv\Scripts\activate && uvicorn backend.main:app --reload --reload-dir backend"

echo Starting Vite frontend on http://localhost:5173 ...
start "Finance Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are starting in new windows.
echo.
echo   API:      http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo.
echo Close the two server windows to stop.
