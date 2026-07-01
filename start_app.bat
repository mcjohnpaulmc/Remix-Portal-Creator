@echo off
echo ============================================================
echo  Remix Portal Creator - App Launcher
echo ============================================================
echo.

REM Check if node_modules exists, if not install dependencies first
if not exist "node_modules\" (
    echo [Setup] node_modules not found. Installing dependencies...
    call npm install
    echo.
)

REM Check if this is a production start (built dist exists) or dev mode
if "%1"=="prod" goto PRODUCTION

:DEV
echo [Mode] Development
echo.
echo Starting dev server (Express + Vite) in a new window...
start "Remix Portal - Dev Server" cmd /k "echo [Dev Server] Starting on http://localhost:3000 & echo. & npm run dev"

echo.
echo Starting a second terminal for utility commands (lint, build, etc.)...
start "Remix Portal - Terminal" cmd /k "echo [Terminal] Ready. Run 'npm run build', 'npm run lint', etc. & echo."

echo.
echo ============================================================
echo  App is starting at: http://localhost:3000
echo  Close the Dev Server window to stop the app.
echo ============================================================
goto END

:PRODUCTION
echo [Mode] Production
echo.

REM Build the frontend + backend bundle
echo Building app for production...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed. Fix errors and try again.
    pause
    exit /b 1
)
echo Build complete.
echo.

echo Starting production server in a new window...
start "Remix Portal - Server" cmd /k "echo [Production Server] Starting on http://localhost:3000 & echo. & node dist/server.cjs"

echo.
echo Starting a second terminal for monitoring...
start "Remix Portal - Monitor" cmd /k "echo [Monitor] Server running at http://localhost:3000 & echo Type 'curl http://localhost:3000/api/database' to check API & echo."

echo.
echo ============================================================
echo  App is running at: http://localhost:3000
echo  Close the Server window to stop the app.
echo ============================================================

:END
echo.
pause
