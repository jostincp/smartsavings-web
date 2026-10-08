# SmartSavings — Landing

Landing page de SmartSavings, el asistente de finanzas personales en WhatsApp.
Construida con **Astro 6** y **Tailwind CSS v4**, con salida estática.

## Comandos

| Comando           | Acción                                          |
| :---------------- | :---------------------------------------------- |
| `npm install`     | Instala las dependencias                        |
| `npm run dev`     | Servidor local en `http://localhost:4321`       |
| `npm run build`   | Genera el sitio de producción en `./dist/`      |
| `npm run preview` | Sirve el build de producción localmente         |

Requiere Node.js 22.12 o superior.

## Estructura

```text
src/
├── components/
│   ├── ui/                 # Piezas compartidas: Icon, Button, SectionHeader, Logo
│   ├── Navbar.astro        # Navegación fija + menú móvil accesible
│   ├── Hero.astro          # Titular, CTA y demo
│   ├── WhatsAppDemo.astro  # Demo interactiva: audio / foto / texto → extracción → confirmación
│   ├── Benefits.astro      # #beneficios
│   ├── HowItWorks.astro    # #como-funciona
│   ├── Calculator.astro    # #calculadora
│   ├── Comparison.astro    # #comparativa
│   ├── Pricing.astro       # #precios
│   ├── Faq.astro           # #preguntas (incluye JSON-LD FAQPage)
│   ├── FinalCta.astro
│   └── Footer.astro        # Incluye el botón flotante de WhatsApp (solo móvil)
├── layouts/Layout.astro    # <head>, metadatos, fuentes y revelado al hacer scroll
├── lib/site.ts             # Número de WhatsApp, waLink() y enlaces de navegación
├── pages/index.astro       # Orden de las secciones
└── styles/global.css       # Tokens de diseño (@theme) y utilidades
```

## Sistema de diseño

- **Tokens** en `src/styles/global.css` (`@theme`): neutrales `ink`, `body`, `muted`, `line`, `canvas`, `surface`;
  acento `brand-*` (verde fintech); la paleta `wa-*` se reserva para el mockup de WhatsApp.
- **Tipografía**: Geist (texto) y Geist Mono (etiquetas y cifras).
- **Iconos**: usa siempre `<Icon name="…" />`; un nombre desconocido hace fallar el build.
- **Enlaces**: solo anclas a secciones existentes o `waLink()`; nunca `href="#"`.
- **Textos**: en español (Colombia), con montos en formato `$18.000`.

Para que las vistas previas en redes usen URLs absolutas (`og:image`, `canonical`), define el dominio de
producción en `astro.config.mjs` con la opción `site`.

## Docker

La imagen no compila el sitio: copia `dist/` a Nginx. Primero ejecuta `npm run build` y luego
`docker compose up --build`. El servicio se une a la red externa `web-network` (pensada para un proxy inverso),
así que debe existir antes (`docker network create web-network`).
