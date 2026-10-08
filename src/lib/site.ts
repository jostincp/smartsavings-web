export const SITE = {
  name: 'SmartSavings',
  tagline: 'Tus gastos bajo control desde WhatsApp',
  description:
    'Registra tus gastos enviando un audio, una foto del recibo o un texto por WhatsApp. SmartSavings extrae monto, categoría y comercio con IA, y tú solo confirmas.',
  whatsappNumber: '573332937647',
  whatsappDisplay: '+57 333 293 7647',
  year: 2026,
} as const;

/** Builds a wa.me link, optionally with a prefilled message. */
export function waLink(text?: string): string {
  const base = `https://wa.me/${SITE.whatsappNumber}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export const WA_START_TEXT = 'Hola SmartSavings, quiero empezar a registrar mis gastos';

export interface NavLink {
  label: string;
  href: string;
}

/** Primary navigation. Every href must match a section id on the page. */
export const NAV_LINKS: NavLink[] = [
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Calculadora', href: '#calculadora' },
  { label: 'Precios', href: '#precios' },
  { label: 'Preguntas', href: '#preguntas' },
];
