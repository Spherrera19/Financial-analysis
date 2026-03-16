@echo off
echo Activating virtual environment...
call venv\Scripts\activate

echo Generating financial data...
python generate_dashboard.py
if %errorlevel% neq 0 (
    echo ERROR: Python script failed.
    exit /b 1
)

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
echo ============================================
echo  Build complete!
echo  Starting local server at http://localhost:3000
echo  Press Ctrl+C to stop.
echo ============================================
echo.
cd frontend
npx serve -s dist -l 3000
