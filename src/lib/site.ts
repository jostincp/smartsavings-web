export const SITE = {
  name: 'SmartSavings',
  company: 'SolutionsHub',
  tagline: 'Tus gastos bajo control desde WhatsApp',
  description:
    'Registra tus gastos por WhatsApp con una nota de voz, una foto del recibo o un texto. SmartSavings extrae monto, categoría y comercio con IA; tú solo confirmas.',
  email: 'contacto@solutionshub.dev',
  year: 2026,
} as const;

/** Builds a mailto link with optional subject and body. */
export function mailLink(subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString().replace(/\+/g, '%20');
  return query ? `mailto:${SITE.email}?${query}` : `mailto:${SITE.email}`;
}

export const EARLY_ACCESS_HREF = mailLink(
  'Solicitud de acceso anticipado — SmartSavings',
  'Hola equipo de SolutionsHub,\n\nQuiero solicitar acceso anticipado a la beta de SmartSavings.',
);

export const PRO_WAITLIST_HREF = mailLink(
  'Lista de espera Plan Pro — SmartSavings',
  'Hola equipo de SolutionsHub,\n\nQuiero que me avisen cuando lancen el plan Pro de SmartSavings.',
);

export const QUESTION_HREF = mailLink(
  'Consulta sobre SmartSavings',
  'Hola equipo de SolutionsHub,\n\nTengo una consulta sobre SmartSavings:',
);

export interface NavLink {
  label: string;
  href: string;
}

/** Primary navigation. Every href matches a section id on the home page. */
export const NAV_LINKS: NavLink[] = [
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Cómo funciona', href: '#como-funciona' },
  { label: 'Calculadora', href: '#calculadora' },
  { label: 'Precios', href: '#precios' },
  { label: 'Preguntas', href: '#preguntas' },
];
