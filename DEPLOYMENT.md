# Guía de Deployment Seguro

## ⚠️ Seguridad: Credenciales NUNCA van a GitHub

Las credenciales se configuran SOLO en Vercel, nunca en el código.

## Paso a Paso

### 1. Preparar el repo

```bash
cd meetings-app

# Inicializar git
git init

# Verificar que .gitignore existe
cat .gitignore

# Agregar archivos (sin .env)
git add .
git commit -m "Initial commit"
```

### 2. Subir a GitHub

```bash
# Crear repo en GitHub (via web)
# Luego:
git remote add origin https://github.com/tu-usuario/meetings-vault.git
git branch -M main
git push -u origin main
```

**✅ Seguro:** El `.gitignore` bloquea `.env*.local`

### 3. Deploy en Vercel

#### Opción A: Via Web (más fácil)

1. Ir a [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Importar tu repo de GitHub
4. Vercel detecta Next.js automáticamente
5. Click "Deploy"

#### Opción B: Via CLI

```bash
npm i -g vercel
vercel login
vercel
```

### 4. Configurar Vercel Postgres

```bash
# Crear database
vercel postgres create

# Vercel te pregunta:
# - Database name: meetings-vault-db
# - Region: elegí la más cercana

# Linkear a tu proyecto
vercel link
vercel env pull
```

Esto crea automáticamente `POSTGRES_URL` en tu proyecto.

### 5. Agregar Environment Variables

En Vercel Dashboard:

1. Tu proyecto > Settings > Environment Variables
2. Agregar:

```
GRANOLA_API_KEY = tu_api_key_aqui
GRANOLA_API_URL = https://api.granola.ai/v1
CRON_SECRET = genera_uno_random
```

**Generar CRON_SECRET:**

```bash
# En tu terminal local
openssl rand -hex 32
```

3. Aplicar a: Production, Preview, Development
4. Save

### 6. Re-deploy

```bash
vercel --prod
```

O en Vercel Dashboard: Deployments > Redeploy

### 7. Sync inicial

```bash
# Obtener tu URL de Vercel
# Ejemplo: https://meetings-vault-abc123.vercel.app

curl -X POST https://tu-app.vercel.app/api/sync \
  -H "Authorization: Bearer tu_cron_secret_aqui"
```

Deberías ver:
```json
{
  "success": true,
  "synced": 10,
  "message": "Synced 10 meetings from Granola"
}
```

### 8. Verificar

Abrir: `https://tu-app.vercel.app`

Deberías ver tus meetings sincronizados.

## Cómo obtener Granola API Key

### Si tenés Enterprise plan:

1. Abrir Granola
2. Settings (avatar abajo izquierda)
3. Workspaces
4. Tab "API"
5. Click "Generate API Key"
6. Copiar y pegar en Vercel

### Si NO tenés Enterprise plan:

Hay dos alternativas:

#### Alternativa 1: Usar MCP local (requiere Kiro corriendo)

Modificar `/app/api/sync/route.ts` para usar el MCP de Granola vía Kiro.

#### Alternativa 2: Leer cache local

Modificar `/app/api/sync/route.ts` para leer desde:
```
C:\Users\S689433\AppData\Roaming\Granola\Cache
```

Esto requiere que la app corra localmente o que subas los archivos manualmente.

## Verificación de Seguridad

### ✅ Checklist antes de push

```bash
# Verificar que no hay .env en staging
git status

# Verificar .gitignore
cat .gitignore | grep .env

# Ver qué se va a subir
git diff --cached
```

### ❌ NUNCA hacer esto:

```bash
# MAL - expone credenciales
git add .env.local
git commit -m "add env"
git push
```

### ✅ Hacer esto:

```bash
# BIEN - credenciales solo en Vercel
# Código en GitHub
# Env vars en Vercel Dashboard
```

## Troubleshooting

### Error: "Granola API error: 401"

- Verificar que `GRANOLA_API_KEY` está configurada en Vercel
- Verificar que la key es válida en Granola Settings

### Error: "Failed to fetch meetings"

- Verificar que `POSTGRES_URL` está configurada
- Verificar que la tabla existe (el sync la crea automáticamente)

### Cron no corre

- Verificar `vercel.json` está en el repo
- Verificar que el proyecto está en plan Pro (crons requieren Pro)
- Alternativa: usar un servicio externo como [cron-job.org](https://cron-job.org)

## Cron sin Vercel Pro

Si no tenés plan Pro, podés usar un servicio externo:

1. Ir a [cron-job.org](https://cron-job.org) (gratis)
2. Crear job:
   - URL: `https://tu-app.vercel.app/api/sync`
   - Schedule: Daily at 00:00
   - Headers: `Authorization: Bearer tu_cron_secret`
3. Save

## Monitoreo

Ver logs en Vercel:

```bash
vercel logs
```

O en Dashboard: Deployments > [tu deploy] > Logs
