interface JsonLdProps {
  readonly data: object;
  readonly nonce?: string;
}

export function JsonLd({ data, nonce }: JsonLdProps) {
  // Escape characters that would allow injection through an embedded </script> tag.
  const safeJson = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // eslint-disable-next-line react/no-danger -- content is Unicode-escaped above; injection not possible
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}
