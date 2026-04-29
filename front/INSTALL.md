# 🚀 Guía de Instalación Rápida

## Requisitos Previos
- Node.js 16 o superior
- npm o yarn
- Servidor Vicidial con API habilitada (opcional para desarrollo)

## Instalación Paso a Paso

### 1️⃣ Descargar e Instalar Dependencias

```bash
# Si descargaste el proyecto como ZIP, descomprímelo primero
unzip vicidial-admin-panel.zip
cd vicidial-admin-panel

# Instalar dependencias del frontend
npm install

# Instalar dependencias del backend
cd server
npm install
cd ..
```

### 2️⃣ Configurar el Backend (Opcional)

Si quieres conectarte a un servidor Vicidial real:

```bash
# Navegar a la carpeta del servidor
cd server

# Copiar el archivo de configuración de ejemplo
cp .env.example .env

# Editar el archivo .env con tus credenciales
nano .env
```

Contenido del archivo `.env`:
```env
PORT=3001
NODE_ENV=development

# URL de tu servidor Vicidial
VICIDIAL_API_URL=http://tu-servidor-vicidial/vicidial/non_agent_api.php
VICIDIAL_API_USER=tu_usuario_api
VICIDIAL_API_PASS=tu_password_api
VICIDIAL_SOURCE=admin_panel

# Permitir conexión desde el frontend
CORS_ORIGIN=http://164.92.67.176:5173
```

### 3️⃣ Ejecutar la Aplicación

**Opción A: Ejecutar en dos terminales (Recomendado)**

Terminal 1 - Backend:
```bash
cd server
npm run dev
```

Terminal 2 - Frontend:
```bash
npm run dev
```

**Opción B: Script automático (Linux/Mac)**

```bash
# Dar permisos de ejecución
chmod +x start.sh

# Ejecutar
./start.sh
```

### 4️⃣ Acceder a la Aplicación

- **Frontend:** http://164.92.67.176:5173
- **Backend API:** http://164.92.67.176:3001

**Credenciales de acceso:**

| Usuario | Contraseña | Permisos |
|---------|-----------|----------|
| `admin` | `admin` | Acceso completo excepto configuración |
| `desarrollo` | `desarrollo` | Acceso total incluyendo configuración |

## ✅ Verificar Instalación

1. Abre http://164.92.67.176:5173 en tu navegador
2. Deberías ver la pantalla de login con fondo de montaña nevada
3. Inicia sesión con `admin` / `admin`
4. Verás el dashboard con los KPIs

## 🔧 Solución de Problemas Comunes

### Error: "Cannot find module"
```bash
# Reinstalar dependencias
rm -rf node_modules
npm install

# En el backend también
cd server
rm -rf node_modules
npm install
```

### Error: "Port 5173 is already in use"
```bash
# Cambiar el puerto en vite.config.ts
# O cerrar la aplicación que está usando el puerto 5173
```

### Error: "Port 3001 is already in use"
```bash
# Cambiar PORT en server/.env
# O cerrar la aplicación que está usando el puerto 3001
```

### Los estilos no se cargan
```bash
# Limpiar caché y reinstalar
npm run build
rm -rf node_modules/.vite
npm run dev
```

### El backend no conecta con Vicidial
- Verifica que la URL de Vicidial sea accesible
- Verifica las credenciales del usuario API
- Asegúrate de que el usuario tenga permisos de API en Vicidial

## 📦 Estructura de Archivos Importantes

```
vicidial-admin-panel/
├── index.html          # Punto de entrada HTML
├── main.tsx            # Punto de entrada React
├── App.tsx             # Componente principal
├── package.json        # Dependencias del frontend
├── vite.config.ts      # Configuración de Vite
├── tsconfig.json       # Configuración de TypeScript
├── postcss.config.js   # Configuración de PostCSS/Tailwind
├── styles/
│   └── globals.css     # Estilos globales + Tailwind
├── components/         # Componentes React
├── server/
│   ├── server.js       # Servidor Express
│   ├── package.json    # Dependencias del backend
│   └── .env            # Configuración del backend
└── ...
```

## 🎯 Siguiente Paso

Una vez instalado, consulta el [README.md](./README.md) para conocer todas las funcionalidades disponibles.

## 🆘 Soporte

Si encuentras problemas:
1. Revisa los logs en la terminal
2. Verifica que todos los puertos estén disponibles
3. Asegúrate de tener Node.js 16 o superior
4. Consulta la documentación en `/docs`

---

¿Todo funcionando? ¡Excelente! 🎉 Ahora puedes empezar a gestionar tus campañas de Vicidial.
