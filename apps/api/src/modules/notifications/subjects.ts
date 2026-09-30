import { TEMPLATES, type TemplateName, type TemplateData } from './templates';

/**
 * Returns the subject line for a given template and validated data.
 * Subjects are fixed strings (or include only `orderNumber`) — never free-form user data.
 */
export const getSubject = <N extends TemplateName>(name: N, data: TemplateData[N]): string =>
  (TEMPLATES[name].subject as (d: TemplateData[N]) => string)(data);
