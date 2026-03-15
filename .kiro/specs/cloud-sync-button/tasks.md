# Plan de Implementación: Cloud Sync Button

## Visión General

Implementar el desacoplamiento de la PC Windows como único punto de procesamiento. El script PowerShell pasa a ser un agente de backup, y la web app adquiere la capacidad de ejecutar el pipeline completo de sincronización desde cualquier dispositivo.

## Tareas

- [x] 1. Agregar función `Backup-RawDataToS3` al script PowerShell
  - [x] 1.1 Implementar detección del archivo `cache-v*.json` más reciente en `$env:APPDATA\Granola\`
    - Usar `Get-ChildItem` con patrón `cache-v*.json` ordenado por `LastWriteTime -Descending`
    - Si no existe ningún archivo, registrar error con `Write-Log` y retornar sin interrumpir el flujo
    - _Requisitos: 1.1, 1.3_
  - [x] 1.2 Implementar upload del cache crudo a `s3://$BUCKET_NAME/cache-backups/latest.json`
    - Usar `aws s3 cp` con `--region $AWS_REGION` y `--profile $AWS_PROFILE` si aplica
    - Registrar en log la fecha, hora y tamaño del archivo subido al completar exitosamente
    - _Requisitos: 1.1, 1.2, 1.4_
  - [x] 1.3 Implementar lectura del token desde `supabase.json` y upload a `cache-backups/granola-token.json`
    - Leer `$env:APPDATA\Granola\supabase.json`, extraer `workos_tokens.access_token`
    - Serializar payload `{ token, uploaded_at }` y subir a S3
    - Manejar ausencia de `supabase.json` con log de error no fatal
    - _Requisitos: 1.5_
  - [x] 1.4 Integrar `Backup-RawDataToS3` al final de `Sync-Meetings`, después de `Upload-ToS3`
    - La función no debe interrumpir el flujo principal ante errores (todos los errores son no fatales)
    - _Requisitos: 1.1, 1.3_

- [x] 2. Reescribir `app/api/sync/route.ts` — parseo del cache y extracción de datos
  - [x] 2.1 Definir interfaces TypeScript para los modelos de datos
    - Definir `GranolaCache`, `RawMeeting`, `TranscriptSegment`, `FormattedMeeting`, `GranolaTokenFile`, `S3Index`
    - Crear el archivo con las interfaces y los imports necesarios (`@aws-sdk/client-s3`)
    - _Requisitos: 5.1, 7.1_
  - [x] 2.2 Implementar `parseCache(cacheData: unknown)`
    - Validar que exista `cache.cache.state.documents` antes de procesar; lanzar error descriptivo si no
    - Extraer meetings excluyendo los que tengan `deleted_at` o `was_trashed`
    - Construir `transcriptIndex` mapeando `source: "microphone"` → `speaker: "me"` y `source: "system"` → `speaker: "them"`, ordenados por `start_timestamp`
    - _Requisitos: 2.3, 2.4, 2.5, 7.1, 7.2_
  - [ ]* 2.3 Escribir test de propiedad para `parseCache` — Propiedad 3: Completitud del parseo
    - **Propiedad 3: Para todo cache con N meetings válidos (con `id` y `title`, sin `deleted_at` ni `was_trashed`), `parseCache()` debe retornar exactamente esos N meetings**
    - Usar `fc.array(fc.record({ id: fc.string(), title: fc.string(), ... }))` embebido en estructura de cache
    - **Valida: Requisitos 2.3, 2.5**
  - [ ]* 2.4 Escribir test de propiedad para `parseCache` — Propiedad 5: Mapeo correcto de speakers
    - **Propiedad 5: Para todo segmento con `source === "microphone"` → `speaker === "me"`, y `source === "system"` → `speaker === "them"`**
    - Usar `fc.record({ source: fc.constantFrom('microphone', 'system'), ... })`
    - **Valida: Requisito 2.4**
  - [ ]* 2.5 Escribir test de propiedad para `parseCache` — Propiedad 6: Exclusión de meetings eliminados
    - **Propiedad 6: Para todo meeting con `deleted_at` definido o `was_trashed === true`, no debe aparecer en la salida de `parseCache()`**
    - Generar meetings con `deleted_at` o `was_trashed` aleatorios mezclados con meetings válidos
    - **Valida: Requisito 2.5**

- [x] 3. Implementar funciones de procesamiento en `app/api/sync/route.ts`
  - [x] 3.1 Implementar `fixEncoding(str: string): string`
    - Convertir texto interpretado como Latin-1 a UTF-8 correcto (espejo del fix del PowerShell)
    - _Requisitos: 2.9_
  - [ ]* 3.2 Escribir test de propiedad para `fixEncoding` — Propiedad 4: Corrección de encoding
    - **Propiedad 4: Para toda cadena producida por la Granola API, `fixEncoding()` debe producir una cadena UTF-8 válida sin caracteres U+FFFD**
    - Usar `fc.string()` con caracteres Latin-1 y verificar ausencia de `\uFFFD`
    - **Valida: Requisito 2.9**
  - [x] 3.3 Implementar `formatMeeting(raw, transcriptIndex, summaryIndex): FormattedMeeting`
    - Incluir todos los campos requeridos: `id`, `title`, `date`, `updated_at`, `status`, `attendees`, `notes_markdown`, `notes_plain`, `summary`, `transcript`, `chapters`, `workspace_id`
    - Lógica de fecha: `created_at` → `google_calendar_event.start.dateTime` → fecha actual UTC como fallback
    - Extraer `creator` y `attendees` del objeto `people`
    - _Requisitos: 5.1, 5.2, 5.3_
  - [x] 3.4 Implementar `partitionByPeriod(meetings: FormattedMeeting[]): Record<string, FormattedMeeting[]>`
    - Agrupar meetings por período `YYYY-MM` basado en el campo `date`
    - _Requisitos: 2.10_
  - [ ]* 3.5 Escribir test de propiedad para serialización — Propiedad 1: Round-trip de serialización
    - **Propiedad 1: Para todo conjunto de meetings procesados válidos, `JSON.parse(JSON.stringify(meeting))` debe producir un objeto estructuralmente equivalente al original**
    - Usar `fc.record(...)` con todos los campos de `FormattedMeeting`
    - **Valida: Requisito 7.4**

- [x] 4. Implementar `fetchGranolaSummaries` y lógica S3 en `app/api/sync/route.ts`
  - [x] 4.1 Implementar `fetchGranolaSummaries(token: string): Promise<SummaryIndex>`
    - POST a `https://api.granola.ai/v2/get-documents` con body `{ limit: 100, offset: 0, include_last_viewed_panel: true }`
    - Headers: `User-Agent: 'Granola/5.354.0'`, `X-Client-Version: '5.354.0'`, `Authorization: Bearer <token>`
    - Extraer summaries de documentos donde `last_viewed_panel.title === "Summary"` (campos `original_content` y `generated_lines`)
    - Aplicar `fixEncoding()` al HTML y a cada bullet
    - _Requisitos: 2.7, 2.8, 2.9_
  - [x] 4.2 Implementar `uploadToS3(files: S3File[]): Promise<void>`
    - Usar `@aws-sdk/client-s3` con `PutObjectCommand`
    - Subir archivos de período `YYYY-MM/meetings.json`, `index.json` y `meetings.json` (legacy)
    - _Requisitos: 2.11_
  - [x] 4.3 Implementar generación del `index.json` con estructura `S3Index`
    - Campos: `generated_at`, `version: "2.0"`, `total_meetings`, array `periods` con `period`, `count`, `file`, `s3_key`, `first_meeting`, `last_meeting`
    - _Requisitos: 5.4_

- [x] 5. Implementar el handler POST y manejo de errores en `app/api/sync/route.ts`
  - [x] 5.1 Implementar autenticación por cookie `meetings-auth`
    - Verificar que la cookie `meetings-auth` sea igual a `AUTH_SECRET`
    - Retornar HTTP 401 con `{ error: "Unauthorized" }` si no es válida
    - _Requisitos: 3.1, 3.2_
  - [x] 5.2 Implementar lectura del cache desde S3 (`cache-backups/latest.json`)
    - Retornar HTTP 404 con `{ error: "Cache backup not found in S3" }` si no existe
    - Retornar HTTP 400 con `{ error: "Invalid cache format" }` si el JSON es inválido o falta `cache.cache.state.documents`
    - _Requisitos: 2.2, 2.3, 7.1, 7.2_
  - [x] 5.3 Implementar lectura del token desde S3 (`cache-backups/granola-token.json`)
    - Retornar HTTP 500 con `{ error: "Granola token not found in S3" }` si no existe
    - _Requisitos: 2.6, 2.14_
  - [x] 5.4 Conectar todo el pipeline en el handler POST y retornar respuesta final
    - Llamar en orden: leer cache → `parseCache` → leer token → `fetchGranolaSummaries` → `formatMeeting` × N → `partitionByPeriod` → `uploadToS3`
    - Retornar HTTP 200 con `{ success: true, meetingsCount, periodsUpdated }` al completar
    - Manejar errores de Granola API con HTTP 502 y errores de S3 con HTTP 500
    - _Requisitos: 2.1, 2.12, 2.13, 2.15, 2.16_
  - [ ]* 5.5 Escribir test de propiedad para idempotencia — Propiedad 2
    - **Propiedad 2: Para todo cache backup fijo, ejecutar `parseCache` + `partitionByPeriod` dos veces consecutivas debe producir archivos con contenido idéntico (excepto `generated_at` / `exported_at`)**
    - Usar un cache fijo generado con `fc.record(...)` y comparar salidas ignorando timestamps
    - **Valida: Requisitos 6.2, 6.3**

- [x] 6. Checkpoint — Verificar que todos los tests pasen
  - Asegurarse de que todos los tests pasen. Consultar al usuario si surgen dudas.

- [x] 7. Agregar botón Sync en `app/page.tsx`
  - [x] 7.1 Agregar estado `syncState: 'idle' | 'loading' | 'success' | 'error'` y `syncMessage: string`
    - _Requisitos: 4.1_
  - [x] 7.2 Implementar función `handleSync()` que llama a `POST /api/sync`
    - Durante la llamada: estado `loading`, botón deshabilitado
    - Al éxito: estado `success` con mensaje que incluye el número de meetings, llamar a `fetchMeetings()`, volver a `idle` después de 3 segundos
    - Al error: estado `error` con el mensaje del campo `error` de la respuesta
    - _Requisitos: 4.2, 4.3, 4.4, 4.5_
  - [x] 7.3 Renderizar el botón Sync en el header con los cuatro estados visuales
    - `idle`: texto "Sync", botón normal
    - `loading`: spinner + texto "Sincronizando...", deshabilitado
    - `success`: texto "✓ N meetings", color verde, vuelve a idle en 3s
    - `error`: mensaje de error en rojo, vuelve a idle al hacer clic
    - _Requisitos: 4.1, 4.3, 4.4, 4.5, 4.6_

- [x] 8. Actualizar `vercel.json` con `maxDuration: 60` para `/api/sync`
  - Agregar configuración de función con `maxDuration: 60` para la ruta `/api/sync`
  - Preservar la configuración de crons existente
  - _Requisitos: 2.12 (timeout de Vercel mencionado en diseño)_

- [x] 9. Checkpoint final — Verificar que todos los tests pasen
  - Asegurarse de que todos los tests pasen. Consultar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Los tests de propiedad requieren `fast-check` (`npm install --save-dev fast-check`)
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints garantizan validación incremental
- Los tests de propiedad validan correctitud universal; los tests unitarios validan ejemplos y casos borde
