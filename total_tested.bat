@echo off
title Remix Portal Creator — Test Suite
color 0A

echo.
echo  ============================================================
echo   Remix Portal Creator — Security ^& Regression Test Suite
echo  ============================================================
echo.

REM Change to the directory containing this batch file
cd /d "%~dp0"

REM Check for Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Python not found on PATH.
    echo  Please install Python 3 and ensure it is on your PATH.
    echo.
    pause
    exit /b 1
)

REM Install requests if not present (silently)
python -c "import requests" >nul 2>&1
if %errorlevel% neq 0 (
    echo  Installing missing dependency: requests ...
    pip install requests --quiet
    echo.
)

REM Run test suite — pass any args through (e.g. --static-only)
python total_test.py %*

set EXIT_CODE=%errorlevel%

echo.
if %EXIT_CODE% equ 0 (
    echo  All tests passed.
) else (
    echo  One or more tests FAILED. Review the output above.
)
echo.
echo  Press any key to close this window ...
pause >nul
exit /b %EXIT_CODE%
