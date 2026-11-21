# Contexto para revisar «SmartSavings Conversacional» (Sami)

Bot de finanzas personales por WhatsApp/Telegram (Colombia, COP). El LLM propone un plan JSON; código determinista valida; Postgres ejecuta en UNA llamada de función (atómica); un LLM redacta; un verificador bloquea cifras sin respaldo.

## Archivos
- Código de los Code nodes de n8n (fuente): `n8n/code/*.js`; versión con prompts insertados: `n8n/code/build/*.js`.
- Prompts: `n8n/code/prompt_plan.txt`, `n8n/code/prompt_redaccion.txt`.
- Pruebas locales: `n8n/harness/test_validar.js` (63 casos, pasan), `n8n/harness/e2e.js`, simulador `n8n/harness/run.js`.
- SQL pendiente de aprobación (contiene DELETE): `n8n/sql/ss_90_borrados.sql` (ss.borrar_movimientos, ss.mantenimiento, ss.limpiar_qa).
- Diseño original (largo): `diseno-smartsavings-conversacional.md` (la implementación se apartó en: funciones SQL en esquema `ss` en lugar de un catálogo SQL en n8n; OpenRouter por HTTP en lugar de nodos LangChain; pago_tarjeta nuevo).
- Las funciones SQL ya aplicadas viven en la BD Supabase (esquema `ss`). Para leerlas usa la herramienta MCP Supabase_DEV execute_sql SOLO con:
  `select p.proname, pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace = 'ss'::regnamespace order by 1;`
  PROHIBIDO ejecutar cualquier función ss.* o cualquier INSERT/UPDATE/DELETE: es la BD de producción.

## Flujo de nodos (n8n, ejecución v1, un solo ítem por turno)
Telegram Entrada | WhatsApp Entrada (deshabilitado) | Chat de Pruebas → **Normalizar Entrada** (code; devuelve [] si no hay que atender; p1 = base64 {platform, chat_id, message_key, execution_id}; p1_ctx = base64 {platform, chat_id, real, editado_de})
→ Registrar Entrada (postgres: `select ss.entrada(convert_from(decode($1,'base64'),'UTF8')::jsonb) as r`, $1 = p1) → ¿Mensaje Nuevo? (r.nuevo)
→ [rama paralela] Señal por Canal → WA leído/escribiendo | TG escribiendo | TG responder botón
→ ¿Esperar Turno? (r.anteriores > 0 && $runIndex < 10) → Esperar 1,5 s → Compuerta de Orden (ss.compuerta) → ¿Esperar Turno?
→ Cargar Contexto (ss.contexto(p1_ctx), onError → Falla Técnica) → Tipo de Entrada
  → medio: Origen del Medio → WA URL+Descarga | TG Descargar Archivo | Medio de Prueba → ¿Audio, Imagen o PDF?
     → audio: Whisper → **Limpiar Transcripción** → Armar Contexto
     → imagen/pdf: Gemini (googleGemini analyze, onError continueRegularOutput) → **Validar Factura** → Guardar Borrador Factura (ss.borrador_factura) → Armar Contexto
  → texto/botón: Armar Contexto
→ **Armar Contexto** (code: máscaras, [CONTEXTO], historial, corpus de evidencia, ruta 'directo'|'planificar', plan_directo, llm_body)
→ ¿Planificar? → Sami Planifica (HTTP POST OpenRouter chat/completions, body = llm_body, onError → Falla Técnica) → **Validar y Compilar**
             → (directo) → **Validar y Compilar** (lee plan de $input: si ctx.ruta==='directo' usa ctx.plan_directo; si no, choices[0].message.content)
→ ¿Hay Pasos? → no: Resultados ; sí: ¿Faltan Tasas? → sí: Pedir TRM → Pedir Tasas er-api → **Normalizar Tasas** → Guardar Tasas (ss.guardar_tasas) → ¿Viene de un Turno? → Ejecutar Plan ; no: Ejecutar Plan
→ Ejecutar Plan (postgres `select ss.ejecutar(...) as r` con $('Validar y Compilar').first().json.p1; onError → Falla Técnica)
→ **Resultados del Turno** (code) → ¿Redactar? (necesita_redaccion) → Sami Redacta (HTTP OpenRouter, onError → Verificar) → **Verificar y Armar Mensajes**
                                                         → no → **Verificar y Armar Mensajes**
**Falla Técnica** (code) → Verificar y Armar Mensajes
→ ¿Es Prueba? → sí: Cerrar Turno (ss.cerrar_turno(cierre_p1)) → ¿Responder en Chat? → Responder en Chat de Pruebas
              → no: Burbuja por Burbuja (splitInBatches 1) → Canal de Salida (switch destino) → WA Enviar Texto/Botones(HTTP Graph)/Imagen | TG Enviar Texto/Botones/Foto → Pausa 0,8 s → siguiente; done → Cerrar Turno
Programados (relojes 14/20/21 h deshabilitados + manual): **Tipo de Envío** → Destinatarios (ss.destinatarios) → **Redactar Proactivo** → Recorrer Avisos → Reservar Envío → ¿Enviar Ahora? → envío → Confirmar/Falla.

## Hechos verificados en la instancia real (spike)
- Code node: Buffer y Luxon (DateTime) disponibles. `$('Nodo inexistente').isExecuted` LANZA error (por eso se envuelve en try/catch). En ejecución manual `$execution.mode === 'test'`.
- Postgres node: queryReplacement con base64 llega como un solo parámetro; jsonb vuelve como objeto JS; usuario `postgres`.
- Expresiones: `JSON.stringify(x).base64Encode()` funciona con UTF-8.
- OpenRouter por HTTP con credencial predefinida openRouterApi funciona; respuesta en choices[0].message.content.

## Invariantes que deben cumplirse
1. Ningún monto se escribe si no sale del texto de la persona (corpus) — validador.
2. Identidad siempre se resuelve en SQL por (platform, chat_id, verified_at not null); el LLM nunca ve user_id.
3. Borrados en dos pasos con consentimiento en un mensaje POSTERIOR.
4. Un fallo nunca se narra como éxito; toda cifra dicha está en numeros_permitidos.
5. Vinculación de canal solo con código enviado al canal ya verificado.
6. Los chats `qa-…` son de prueba; en modo prueba no sale nada a Meta/Telegram.
