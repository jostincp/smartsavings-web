# Compara el jsCode de cada Code node publicado en n8n con n8n/code/build/*.js
import json, sys, glob, os
MAP = {'Normalizar Entrada': 'normalizar_entrada', 'Medio de Prueba': 'medio_prueba', 'Limpiar Transcripción': 'limpiar_transcripcion',
  'Validar Factura': 'validar_factura', 'Armar Contexto': 'armar_contexto', 'Validar y Compilar': 'validar_compilar', 'Normalizar Tasas': 'normalizar_tasas',
  'Falla Técnica': 'falla_tecnica', 'Resultados del Turno': 'resultados', 'Verificar y Armar Mensajes': 'verificar_mensajes', 'Tipo de Envío': 'tipo_envio',
  'Redactar Proactivo': 'redactar_proactivo'}
d = json.load(open(sys.argv[1]))
nodes = {n['name']: n for n in d['workflow']['nodes']}
B = os.path.join(os.path.dirname(__file__), '..', 'code', 'build')
for nombre, f in MAP.items():
    remoto = nodes[nombre]['parameters'].get('jsCode', '')
    local = open(os.path.join(B, f + '.js')).read()
    if remoto == local: print('OK     ', nombre)
    elif remoto.strip() == 'return $input.all();': print('STUB   ', nombre)
    else:
        i = next((k for k in range(min(len(remoto), len(local))) if remoto[k] != local[k]), min(len(remoto), len(local)))
        print('DIFIERE', nombre, 'en', i, repr(local[max(0,i-30):i+30]), '≠', repr(remoto[max(0,i-30):i+30]))
