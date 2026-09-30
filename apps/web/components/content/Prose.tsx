import type { ContentSection } from '@/lib/content/load';

interface ProseProps {
  readonly sections: readonly ContentSection[];
}

const renderBody = (body: string): string => {
  return body
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent underline hover:no-underline">$1</a>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Newlines between items must not survive into the list: the `<br/>` step below would otherwise
    // place non-<li> children inside the <ul> (axe "list", serious). The list keeps one trailing
    // newline so a following blank line still starts a new paragraph.
    .replace(
      /(<li>.*<\/li>\n?)+/g,
      (match) => `<ul class="list-disc pl-6 space-y-1">${match.replace(/\n/g, '')}</ul>\n`,
    )
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-4">')
    .replace(/\n/g, '<br/>');
};

export function Prose({ sections }: ProseProps) {
  return (
    <div className="prose-content space-y-8">
      {sections.map((section, i) => (
        <section key={i}>
          {section.heading !== undefined && (
            <h2 className="text-xl font-semibold text-foreground mb-3">{section.heading}</h2>
          )}
          <div
            className="text-muted-foreground leading-relaxed"
            // eslint-disable-next-line react/no-danger -- content is sourced from local static MDX/JSON files, not user input
            dangerouslySetInnerHTML={{ __html: `<p class="mt-0">${renderBody(section.body)}</p>` }}
          />
        </section>
      ))}
    </div>
  );
}
