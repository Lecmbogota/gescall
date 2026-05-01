@echo off
chcp 65001 >nul
cls

echo.
echo ============================================
echo 🚀 GesCall - Panel de Administración Vicidial
echo ============================================
echo.

:: Verificar si Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js no está instalado.
    echo Por favor instala Node.js 16 o superior desde https://nodejs.org
    pause
    exit /b 1
)

:: Mostrar versión de Node.js
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js %NODE_VERSION% detectado
echo.

:: Verificar dependencias del frontend
if not exist "node_modules" (
    echo 📦 Instalando dependencias del frontend...
    call npm install
    echo.
)

:: Verificar dependencias del backend
if not exist "server\node_modules" (
    echo 📦 Instalando dependencias del backend...
    cd server
    call npm install
    cd ..
    echo.
)

echo 🔧 Iniciando servicios...
echo.

:: Crear archivo temporal para el PID del backend
set BACKEND_PID_FILE=%TEMP%\gescall_backend.pid

:: Iniciar el backend en una nueva ventana
echo 🖥️  Backend: http://164.92.67.176:3001
start "GesCall Backend" cmd /c "cd server && npm run dev"

:: Esperar un poco para que el backend inicie
timeout /t 3 /nobreak >nul

echo 🌐 Frontend: http://localhost:5173
echo.
echo ============================================
echo ✨ ¡Aplicación iniciada correctamente!
echo ============================================
echo.
echo 📝 Credenciales de acceso:
echo    • Usuario: admin ^| Contraseña: admin
echo    • Usuario: desarrollo ^| Contraseña: desarrollo
echo.
echo ⏹️  Para detener: Cierra esta ventana o presiona Ctrl+C
echo.

:: Iniciar el frontend
call npm run dev

:: Limpiar al salir
echo.
echo 🛑 Deteniendo servicios...
taskkill /FI "WINDOWTITLE eq GesCall Backend*" /T /F >nul 2>nul
echo ✅ Servicios detenidos
pause
