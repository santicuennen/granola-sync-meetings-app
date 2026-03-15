# Documento de Requisitos: Cloud Sync Button

## Introducción

Esta feature permite desacoplar la PC con Windows como único "servidor de procesamiento" para la app Meetings Vault. Actualmente, un script PowerShell en la PC local lee el cache de Granola (`cache-v6.json`), llama a la API de Granola para obtener AI summaries, fusiona ambas fuentes y sube archivos JSON procesados a S3. Con esta feature, se agrega:

1. **Backup del cache crudo a S3** desde el script PowerShell (para que el cache esté disponible en la nube).
2. **Botón "Sync" en la web app** que, al hacer clic, lee el backup del cache desde S3, parsea los meetings, llama a la API de Granola para obtener summaries, fusiona todo, y escribe los archivos procesados/particionados de vuelta a S3. Así el usuario puede sincronizar desde cualquier dispositivo.

## Glosario

- **Meetings_Vault**: La aplicación web Next.js desplegada en Vercel que muestra datos de meetings de Granola.
- **Sync_Button**: El botón de interfaz en la web app que dispara el proceso de sincronización.
- **Sync_API**: El endpoint API (`POST /api/sync`) en la app Next.js que ejecuta la lógica de sincronización.
- **Cache_Backup**: El archivo de cache crudo de Granola subido a S3 por el script PowerShell, almacenado siempre en la ruta `cache-backups/latest.json`. El archivo fuente es el `cache-v*.json` más reciente encontrado en el directorio AppData de Granola (el nombre exacto puede variar entre versiones, p.ej. `cache-v6.json`, `cache-v7.json`).
- **Granola_API**: El endpoint `https://api.granola.ai/v2/get-documents` (POST) que retorna documentos con AI summaries.
- **Granola_Token**: El bearer token de autenticación para la Granola_API. El PowerShell_Script lo lee de `%APPDATA%\Granola\supabase.json` (campo `workos_tokens.access_token`) y lo sube a S3 en la clave `cache-backups/granola-token.json` como parte del proceso de sincronización. El Sync_API lee el token exclusivamente desde esa ruta en S3.
- **S3_Bucket**: El bucket de AWS S3 (`grnl-meetings`) donde se almacenan los archivos de meetings procesados.
- **Processed_Files**: Los archivos JSON particionados por fecha (`YYYY-MM/meetings.json`), el índice (`index.json`) y el archivo legacy (`meetings.json`) que la app lee para mostrar meetings.
- **PowerShell_Script**: El script `sync-granola-to-s3.ps1` que corre en la PC con Windows.
- **Encoding_Fixer**: La lógica que corrige respuestas de la Granola_API donde texto UTF-8 fue interpretado como Latin-1.

## Requisitos

### Requisito 1: Backup del cache crudo a S3

**User Story:** Como usuario, quiero que el script PowerShell suba el archivo de cache crudo de Granola a S3 como backup, para que la web app pueda acceder al cache sin depender de la PC local.

#### Criterios de Aceptación

1. WHEN el PowerShell_Script ejecuta una sincronización exitosa, THE PowerShell_Script SHALL detectar el archivo `cache-v*.json` más reciente en el directorio AppData de Granola y subirlo a S3 con la clave `cache-backups/latest.json`.
2. WHEN el PowerShell_Script sube el Cache_Backup, THE PowerShell_Script SHALL preservar el contenido original del archivo sin modificaciones.
3. IF no existe ningún archivo que coincida con el patrón `cache-v*.json` en el directorio AppData de Granola, THEN THE PowerShell_Script SHALL registrar un error en el log y continuar con el resto de la sincronización sin subir el Cache_Backup.
4. WHEN el PowerShell_Script sube el Cache_Backup exitosamente, THE PowerShell_Script SHALL registrar en el log la fecha, hora y tamaño del archivo subido.
5. WHEN el PowerShell_Script ejecuta una sincronización, THE PowerShell_Script SHALL leer el token de `supabase.json` (campo `workos_tokens.access_token`) y subirlo a S3 en la clave `cache-backups/granola-token.json`.

### Requisito 2: Endpoint API de sincronización

**User Story:** Como usuario, quiero un endpoint API en la web app que ejecute la lógica de sincronización completa, para poder disparar el proceso desde el navegador.

#### Criterios de Aceptación

1. THE Sync_API SHALL aceptar solicitudes POST en la ruta `/api/sync`.
2. WHEN el Sync_API recibe una solicitud POST autenticada, THE Sync_API SHALL leer el Cache_Backup desde S3 en la clave `cache-backups/latest.json`.
3. WHEN el Sync_API lee el Cache_Backup, THE Sync_API SHALL parsear la estructura JSON y extraer meetings desde `cache.cache.state.documents` y transcripts desde `cache.cache.state.transcripts`.
4. WHEN el Sync_API extrae transcripts, THE Sync_API SHALL mapear segmentos con `source: "microphone"` como speaker `"me"` y segmentos con `source: "system"` como speaker `"them"`, ordenados por `start_timestamp`.
5. WHEN el Sync_API parsea meetings, THE Sync_API SHALL excluir meetings que tengan `deleted_at` o `was_trashed` establecidos.
6. WHEN el Sync_API ha extraído los meetings del cache, THE Sync_API SHALL leer el Granola_Token exclusivamente desde S3 en la clave `cache-backups/granola-token.json`.
7. WHEN el Sync_API llama a la Granola_API, THE Sync_API SHALL enviar un POST con body `{ limit: 100, offset: 0, include_last_viewed_panel: true }` y headers `User-Agent: 'Granola/5.354.0'`, `X-Client-Version: '5.354.0'` y `Authorization: Bearer <Granola_Token>`.
8. WHEN el Sync_API recibe respuesta de la Granola_API, THE Sync_API SHALL extraer summaries de documentos donde `last_viewed_panel.title` sea `"Summary"`, incluyendo `original_content` (HTML) y `generated_lines` (bullets de texto).
9. WHEN el Sync_API procesa texto de la Granola_API, THE Encoding_Fixer SHALL convertir texto interpretado como Latin-1 a UTF-8 correcto.
10. WHEN el Sync_API ha fusionado datos del cache y summaries de la API, THE Sync_API SHALL generar Processed_Files particionados por fecha (`YYYY-MM/meetings.json`), un archivo `index.json` con metadata de períodos, y un archivo legacy `meetings.json`.
11. WHEN el Sync_API genera los Processed_Files, THE Sync_API SHALL subir cada archivo al S3_Bucket en las claves correspondientes.
12. WHEN el Sync_API completa la sincronización exitosamente, THE Sync_API SHALL retornar una respuesta JSON con `{ success: true, meetingsCount: <número>, periodsUpdated: <número> }` y código HTTP 200.
13. IF el Cache_Backup no existe en S3, THEN THE Sync_API SHALL retornar una respuesta JSON con `{ error: "Cache backup not found in S3" }` y código HTTP 404.
14. IF el archivo de token no existe en `cache-backups/granola-token.json` en S3, THEN THE Sync_API SHALL retornar una respuesta JSON con `{ error: "Granola token not found in S3" }` y código HTTP 500.
15. IF la llamada a la Granola_API falla, THEN THE Sync_API SHALL retornar una respuesta JSON con `{ error: "Granola API request failed", details: <mensaje> }` y código HTTP 502.
16. IF la escritura a S3 falla, THEN THE Sync_API SHALL retornar una respuesta JSON con `{ error: "S3 upload failed", details: <mensaje> }` y código HTTP 500.

### Requisito 3: Autenticación del endpoint de sincronización

**User Story:** Como usuario, quiero que el endpoint de sincronización esté protegido por la misma autenticación de la app, para que solo usuarios autorizados puedan disparar una sincronización.

#### Criterios de Aceptación

1. WHEN el Sync_API recibe una solicitud POST, THE Sync_API SHALL verificar que la cookie de autenticación `meetings-auth` sea válida.
2. IF la solicitud al Sync_API no contiene una cookie de autenticación válida, THEN THE Sync_API SHALL retornar código HTTP 401 con `{ error: "Unauthorized" }`.

### Requisito 4: Botón de sincronización en la interfaz

**User Story:** Como usuario, quiero un botón "Sync" visible en la interfaz de la app, para poder disparar la sincronización con un clic desde cualquier dispositivo.

#### Criterios de Aceptación

1. THE Meetings_Vault SHALL mostrar un Sync_Button en el header de la página principal.
2. WHEN el usuario hace clic en el Sync_Button, THE Meetings_Vault SHALL enviar una solicitud POST al Sync_API.
3. WHILE el Sync_API está procesando la solicitud, THE Sync_Button SHALL mostrar un estado de carga (spinner o animación) y estar deshabilitado para prevenir clics múltiples.
4. WHEN el Sync_API retorna una respuesta exitosa, THE Meetings_Vault SHALL mostrar un mensaje de éxito con el número de meetings sincronizados y refrescar la lista de meetings automáticamente.
5. IF el Sync_API retorna un error, THEN THE Meetings_Vault SHALL mostrar un mensaje de error descriptivo al usuario.
6. WHEN el Sync_Button está en estado de carga, THE Sync_Button SHALL mostrar texto indicativo como "Sincronizando..." junto al indicador visual.

### Requisito 5: Formato de meetings procesados

**User Story:** Como usuario, quiero que los meetings procesados por el Sync_API tengan el mismo formato que los generados por el PowerShell_Script, para que la app los muestre correctamente sin cambios en el frontend.

#### Criterios de Aceptación

1. THE Sync_API SHALL generar cada meeting con los campos: `id`, `title`, `date`, `updated_at`, `status`, `attendees` (array de objetos con `name` y `email`), `notes_markdown`, `notes_plain`, `summary` (objeto con `html`, `text`, `bullets`), `transcript` (array de segmentos con `start`, `end`, `speaker`, `text`), `chapters` y `workspace_id`.
2. WHEN el Sync_API extrae attendees, THE Sync_API SHALL incluir el `creator` del meeting y todos los `attendees` del objeto `people`.
3. WHEN el Sync_API determina la fecha del meeting, THE Sync_API SHALL usar `created_at` como primera opción, `google_calendar_event.start.dateTime` como segunda opción, y la fecha actual UTC como fallback.
4. THE Sync_API SHALL generar el archivo `index.json` con los campos: `generated_at`, `version: "2.0"`, `total_meetings`, y un array `periods` con `period`, `count`, `file`, `s3_key`, `first_meeting` y `last_meeting` por cada período.

### Requisito 6: Idempotencia de la sincronización

**User Story:** Como usuario, quiero que ejecutar la sincronización múltiples veces con los mismos datos produzca el mismo resultado, para evitar datos duplicados o corruptos.

#### Criterios de Aceptación

1. WHEN el Sync_API procesa meetings, THE Sync_API SHALL usar el `id` del meeting como identificador único, reemplazando datos anteriores del mismo meeting en lugar de duplicarlos.
2. WHEN el Sync_API genera Processed_Files para un período, THE Sync_API SHALL sobrescribir el archivo existente en S3 para ese período con los datos completos actualizados.
3. WHEN el Sync_API se ejecuta dos veces consecutivas con el mismo Cache_Backup, THE Sync_API SHALL producir Processed_Files idénticos en contenido (excepto timestamps de generación).

### Requisito 7: Parseo del cache y pretty-printing

**User Story:** Como desarrollador, quiero que el parseo del cache y la serialización de los datos procesados sean robustos y verificables, para garantizar integridad de datos.

#### Criterios de Aceptación

1. WHEN el Sync_API parsea el Cache_Backup, THE Sync_API SHALL validar que la estructura contenga `cache.cache.state.documents` antes de procesar.
2. IF el Cache_Backup tiene una estructura JSON inválida, THEN THE Sync_API SHALL retornar un error descriptivo indicando que el formato del cache es inválido.
3. THE Sync_API SHALL serializar los Processed_Files como JSON válido con encoding UTF-8.
4. FOR ALL meetings procesados válidos, parsear los Processed_Files generados y volver a serializarlos SHALL producir un objeto equivalente al original (propiedad round-trip).
