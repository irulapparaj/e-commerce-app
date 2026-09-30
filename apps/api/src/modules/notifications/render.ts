import { render, toPlainText } from '@react-email/render';

import { TEMPLATES, validateTemplateData, type TemplateName, type TemplateData } from './templates';

export interface RenderedEmail {
  readonly html: string;
  readonly text: string;
  readonly subject: string;
}

/**
 * Validates, renders and returns HTML + plaintext for a named template.
 * Throws ZodError if `data` does not satisfy the template schema.
 */
export const renderTemplate = async <N extends TemplateName>(
  name: N,
  data: unknown,
): Promise<RenderedEmail> => {
  const validated = validateTemplateData(name, data);
  const template = TEMPLATES[name];
  const element = (template.component as (d: TemplateData[N]) => React.ReactElement)(validated);
  const subject = (template.subject as (d: TemplateData[N]) => string)(validated);

  const html = await render(element);
  const text = toPlainText(html);

  return { html, text, subject };
};
