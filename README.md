# Meetings Vault 🎯

App Next.js para sincronizar y visualizar tus meetings de Granola automáticamente.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## Demo

[Ver demo en vivo](https://tu-app.vercel.app) (próximamente)

## ¿Qué hace?

Sincroniza automáticamente tus meetings de Granola a una base de datos y te da una UI para buscarlos y visualizarlos.

## Features

- 🔄 Sync automático diario desde Granola API
- 🔍 Búsqueda por título, attendees, contenido
- 📅 Organización por fecha
- 📝 Vista de summary y transcript completo
- 🏷️ Filtrado por tags
- 📱 Responsive design

## Setup

### 1. Clonar y instalar

```bash
cd meetings-app
npm install
```

### 2. Configurar variables de entorno

Crear `.env.local`:

```env
# Granola API (Enterprise plan required)
GRANOLA_API_KEY=tu_api_key_de_granola
GRANOLA_API_URL=https://api.granola.ai/v1

# Vercel Postgres (se auto-configura en Vercel)
POSTGRES_URL=

# Cron secret (genera uno random)
CRON_SECRET=tu_secret_random_aqui
```

### 3. Obtener Granola API Key

1. Ir a Granola Settings > Workspaces
2. Tab "API"
3. Click "Generate API Key"
4. Copiar y pegar en `.env.local`

**Nota:** Requiere plan Enterprise de Granola

### 4. Deploy a Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configurar Postgres
vercel postgres create
```

En Vercel dashboard:
1. Settings > Environment Variables
2. Agregar `GRANOLA_API_KEY` y `CRON_SECRET`
3. Vercel auto-configura `POSTGRES_URL`

### 5. Sync inicial

Trigger manual del sync:

```bash
curl -X POST https://tu-app.vercel.app/api/sync \
  -H "Authorization: Bearer tu_cron_secret"
```

## Cron Job

El sync corre automáticamente todos los días a medianoche (configurado en `vercel.json`).

Para cambiar la frecuencia, editar `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/sync",
      "schedule": "0 */6 * * *"  // Cada 6 horas
    }
  ]
}
```

## Desarrollo local

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Estructura

```
meetings-app/
├── app/
│   ├── page.tsx              # UI principal
│   ├── layout.tsx            # Layout
│   ├── globals.css           # Estilos
│   └── api/
│       ├── meetings/
│       │   ├── route.ts      # GET meetings
│       │   └── [id]/
│       │       └── transcript/
│       │           └── route.ts  # GET transcript
│       └── sync/
│           └── route.ts      # POST sync (cron)
├── package.json
├── vercel.json               # Cron config
└── tailwind.config.js
```

## API Endpoints

- `GET /api/meetings` - Lista todos los meetings
- `GET /api/meetings/[id]/transcript` - Transcript completo
- `POST /api/sync` - Trigger sync manual (requiere auth)

## Alternativa sin Enterprise

Si no tenés plan Enterprise de Granola, podés:

1. Usar el MCP local (requiere Kiro corriendo)
2. Leer la cache local de Granola
3. Usar el script Python que creamos antes

Para eso, modificar `/api/sync/route.ts` para leer de otra fuente.
