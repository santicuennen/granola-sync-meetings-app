# Meetings Vault 🎯

Aplicación web Next.js para visualizar tus meetings de Granola sincronizados automáticamente desde tu PC local a AWS S3.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)
![AWS S3](https://img.shields.io/badge/Storage-AWS_S3-orange)

## ¿Qué hace?

Visualiza tus meetings de Granola en una interfaz web moderna, con:
- AI summaries formateados (HTML)
- Transcripts completos con atribución de speakers
- Búsqueda y filtrado por fecha
- Autenticación por password
- Sincronización automática desde tu PC (Watch mode, polling cada 30 min)

## Arquitectura

```
Windows PC (Local)
    ↓
Granola App → cache-v*.json + API summaries
    ↓
PowerShell Script (Watch mode: polling cada 30 min)
    ↓
AWS S3 (estructura particionada por fecha + cache-backups/)
    ↓
Vercel (Next.js App con autenticación)
    ↓
Navegador Web (botón Sync para sync remoto)
```

## Features

- 🔐 Autenticación con password
- 🤖 AI summaries formateados (HTML + texto + bullets)
- 📝 Transcripts completos con speaker attribution
- 📅 Organización por fecha (estructura particionada)
- 🔍 Búsqueda por título y contenido
- 📱 Diseño responsive
- ⚡ Sync remoto desde la web (botón Sync: lee cache + token de S3, llama Granola API)
- 💾 Estructura escalable (particionada por año/mes)

## Setup Local

### 1. Clonar y instalar

```bash
cd meetings-app
npm install
```

### 2. Configurar variables de entorno

Copiar el archivo de ejemplo:

```bash
cp .env.local.example .env.local
```

Editar `.env.local` con tus credenciales:

```env
# AWS S3 Configuration (requerido)
AWS_ACCESS_KEY_ID=tu_aws_access_key
AWS_SECRET_ACCESS_KEY=tu_aws_secret_key
AWS_REGION=us-east-1
GRANOLA_S3_BUCKET=grnl-meetings

# Authentication (requerido)
AUTH_PASSWORD=tu-password-seguro
AUTH_SECRET=string-random-largo-para-cookies
```

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

### 4. Configurar sincronización local (Windows)

Ver documentación completa en `../granola-sync-service/README.md`

```powershell
cd ../granola-sync-service

# Configurar variables de entorno
$env:GRANOLA_S3_BUCKET = "grnl-meetings"
$env:AWS_REGION = "us-east-1"

# Instalar como Startup Shortcut (no requiere admin, usa -Watch)
# Ver ../granola-sync-service/README.md para instrucciones
.\sync-granola-to-s3.ps1 -Watch
```

## Deploy a Vercel

### 1. Push a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/meetings-vault.git
git push -u origin main
```

### 2. Importar en Vercel

1. Ir a [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Importar tu repositorio de GitHub
4. Vercel detecta automáticamente Next.js

### 3. Configurar variables de entorno en Vercel

En Vercel Dashboard → Settings → Environment Variables:

```
AWS_ACCESS_KEY_ID = tu_aws_access_key
AWS_SECRET_ACCESS_KEY = tu_aws_secret_key
AWS_REGION = us-east-1
GRANOLA_S3_BUCKET = grnl-meetings
AUTH_PASSWORD = tu-password-seguro
AUTH_SECRET = string-random-largo-para-cookies
```

Aplicar a: Production, Preview, Development

### 4. Deploy

Click "Deploy" o usar CLI:

```bash
npm i -g vercel
vercel --prod
```

⚠️ **Importante:** Después de agregar/modificar variables de entorno en Vercel, debes hacer un nuevo deploy para que tomen efecto.

## Uso de la App

### 1. Acceder a la app

Ir a tu URL de Vercel (ej: `https://tu-app.vercel.app`)

### 2. Login

Ingresar el password configurado en `AUTH_PASSWORD`

### 3. Ver meetings

- Lista de meetings ordenados por fecha (más recientes primero)
- Click en un meeting para ver detalles completos
- AI summary formateado con HTML
- Transcript completo con speaker attribution
- Botón "Sync" en el header para sincronizar desde la web

### 4. Búsqueda

Usar el campo de búsqueda para filtrar por:
- Título del meeting
- Contenido del summary
- Nombres de attendees

## Estructura del Proyecto

```
meetings-app/
├── app/
│   ├── page.tsx                    # UI principal con lista de meetings
│   ├── login/
│   │   └── page.tsx                # Página de autenticación
│   ├── layout.tsx                  # Layout global
│   ├── globals.css                 # Estilos Tailwind
│   └── api/
│       ├── auth/
│       │   └── route.ts            # POST /api/auth - Login
│       ├── meetings/
│       │   ├── route.ts            # GET /api/meetings - Lista meetings
│       │   └── [id]/
│       │       └── transcript/
│       │           └── route.ts    # GET /api/meetings/[id]/transcript
│       └── sync/
│           └── route.ts            # POST /api/sync - Trigger manual
├── middleware.ts                   # Protección de rutas con auth
├── package.json
├── vercel.json                     # Configuración de Vercel
└── tailwind.config.js
```

## API Endpoints

### Públicos
- `POST /api/auth` - Autenticación (recibe password, retorna cookie)

### Protegidos (requieren autenticación)
- `GET /api/meetings` - Lista todos los meetings desde S3
  - Lee estructura particionada (index.json + períodos)
  - Fallback a meetings.json legacy si no existe índice
  - Incluye summaries AI (HTML + texto + bullets)
- `GET /api/meetings/[id]/transcript` - Transcript completo de un meeting
- `POST /api/sync` - Sync remoto: lee cache + token de S3, llama Granola API, sube meetings actualizados

## Autenticación

La app usa autenticación simple con password:

1. Usuario ingresa password en `/login`
2. API valida contra `AUTH_PASSWORD` en variables de entorno
3. Si es correcto, setea cookie `meetings-auth` con valor de `AUTH_SECRET`
4. Middleware verifica la cookie en cada request
5. Cookie dura 7 días

**Seguridad:**
- Cookie `httpOnly` (no accesible desde JavaScript)
- Cookie `secure` en producción (solo HTTPS)
- Cookie `sameSite: lax` (protección CSRF)

## Datos Mostrados

### Por cada meeting:
- **Título** y fecha
- **Attendees** (nombre y email)
- **AI Summary** en 3 formatos:
  - HTML formateado (renderizado con `dangerouslySetInnerHTML`)
  - Texto plano
  - Bullets (lista de puntos clave)
- **Transcript completo** con:
  - Atribución de speaker (`me` vs `them`)
  - Timestamps de inicio/fin
  - Texto de cada segmento
- **Notas** (markdown y plain text)

### Estructura de datos en S3

```
s3://grnl-meetings/
├── index.json                    # Índice con metadata de períodos
├── meetings.json                 # Archivo legacy completo
├── 2026-03/meetings.json        # Meetings de marzo 2026
├── 2026-02/meetings.json        # Meetings de febrero 2026
├── cache-backups/
│   ├── latest.json              # Cache crudo (para sync remoto)
│   └── granola-token.json       # Token de autenticación (para sync remoto)
└── backups/
    └── index-20260313-141438.json
```

## Sincronización

### Desde la PC (automático)

El script PowerShell en tu PC local (`granola-sync-service/sync-granola-to-s3.ps1`) corre en modo Watch:
- Sync inicial al arrancar
- Polling cada 30 minutos: compara `LastWriteTime` de `cache-v*.json`
- Si cambió, sincroniza meetings + cache crudo + token a S3
- Se configura como Startup Shortcut (arranca con Windows, no requiere admin)

### Desde la web (botón Sync)

La app tiene un botón "Sync" en el header que ejecuta `POST /api/sync`:
1. Lee `cache-backups/latest.json` desde S3 (cache crudo subido por el script)
2. Lee `cache-backups/granola-token.json` desde S3 (token válido)
3. Parsea meetings + transcripts del cache
4. Llama a Granola API para obtener summaries (con refresh de token si expiró)
5. Merge con datos existentes en S3 (evita degradación de datos)
6. Sube meetings actualizados a S3

Esto permite sincronizar desde cualquier navegador sin que la PC esté encendida, siempre que el token en S3 sea válido.

**Costo:** ~$0.03/mes en S3 (insignificante)
