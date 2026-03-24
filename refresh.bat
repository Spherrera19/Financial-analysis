@echo off
echo ============================================
echo  Finance Dashboard — Full Rebuild Pipeline
echo  ingest -^> validate -^> build -^> serve
echo ============================================
echo.

echo Activating virtual environment...
call venv\Scripts\activate

echo Ingesting CSV data into finance.db...
python generate_dashboard.py
if %errorlevel% neq 0 (
    echo ERROR: Data pipeline failed.
    exit /b 1
)

echo Validating dashboard payload against TypeScript contract...
cd frontend
call npm run validate
if %errorlevel% neq 0 (
    echo ERROR: Payload validation failed.
    cd ..
    exit /b 1
)
cd ..

echo Building React app...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: npm build failed.
    cd ..
    exit /b 1
)
cd ..

echo.
echo Starting FastAPI backend on http://localhost:8000 ...
start "Finance API" cmd /k "call venv\Scripts\activate && uvicorn backend.main:app --port 8000"

echo Starting static frontend on http://localhost:3000 ...
echo (serve.json handles SPA routing — all paths rewrite to index.html)
echo.
echo ============================================
echo  Build complete!
echo   API:      http://localhost:8000
echo   Frontend: http://localhost:3000
echo   API Docs: http://localhost:8000/docs
echo ============================================
echo.
cd frontend
npx serve dist -l 3000
