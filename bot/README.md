# Sami · bot conversacional de SmartSavings (n8n)

Código fuente del workflow **SmartSavings Conversacional** (n8n `ABTLSBBHzd6MrTVj`) y de su flujo de errores **SmartSavings Errores** (`cgktSNfOE6YhgopV`).

Cómo funciona un turno: planificador LLM (OpenRouter) → validador determinista → SQL atómico (`ss.ejecutar`) → hechos reales → redactor LLM → verificador que bloquea cifras sin respaldo y «anoté» sin escritura → mensajes por canal.

| Carpeta | Qué hay |
|---|---|
| `code/` | Fuente de cada Code node; los prompts están en `prompt_plan.txt` y `prompt_redaccion.txt` |
| `harness/` | Simulador local de n8n, pruebas del validador y comparador contra lo publicado |
| `sql/` | Migraciones del esquema `ss` (`ss_90` borrados, todavía sin aplicar; `ss_91` arreglos de la revisión) y base `fn/` |
| `workflow_sdk.js` | Definición del workflow con el SDK de n8n |

## Uso

```bash
cd harness && npm install
node build_code.js      # genera code/build/*.js (inyecta los prompts)
node test_validar.js    # pruebas del validador
node gen_sdk.js         # expande workflow_sdk.js a SDK literal
```

`code/build/*.js` es lo que va pegado en cada Code node. `comparar.py <detalles.json>` verifica que lo publicado coincida byte a byte.

Las credenciales viven en n8n; aquí solo hay sus IDs. Nunca guardes llaves (OpenRouter, Meta, Telegram) en este repositorio.
