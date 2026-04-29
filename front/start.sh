#!/bin/bash

echo "🚀 Iniciando GesCall - Panel de Administración Vicidial"
echo ""

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null
then
    echo "❌ Node.js no está instalado. Por favor instala Node.js 16 o superior."
    exit 1
fi

echo "✅ Node.js $(node --version) detectado"
echo ""

# Verificar si las dependencias están instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias del frontend..."
    npm install
fi

if [ ! -d "server/node_modules" ]; then
    echo "📦 Instalando dependencias del backend..."
    cd server && npm install && cd ..
fi

echo ""
echo "🔧 Iniciando servicios..."
echo ""

# Iniciar el backend en segundo plano
echo "🖥️  Backend: http://164.92.67.176:3001"
cd server && npm run dev &
BACKEND_PID=$!

# Esperar un poco para que el backend inicie
sleep 3

# Volver al directorio raíz
cd ..

# Iniciar el frontend
echo "🌐 Frontend: http://localhost:5173"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ ¡Aplicación iniciada correctamente!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Credenciales de acceso:"
echo "   • Usuario: admin | Contraseña: admin"
echo "   • Usuario: desarrollo | Contraseña: desarrollo"
echo ""
echo "⏹️  Para detener: Presiona Ctrl+C"
echo ""

npm run dev

# Limpiar procesos al salir
trap "echo '' && echo '🛑 Deteniendo servicios...' && kill $BACKEND_PID 2>/dev/null && echo '✅ Servicios detenidos' && exit 0" EXIT INT TERM
