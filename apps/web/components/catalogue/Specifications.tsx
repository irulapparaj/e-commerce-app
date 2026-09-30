import { getTranslations } from 'next-intl/server';

interface SpecificationsProps {
  readonly specs: Readonly<Record<string, string>>;
}

export async function Specifications({ specs }: SpecificationsProps) {
  const entries = Object.entries(specs);
  if (entries.length === 0) return null;

  const t = await getTranslations('catalogue');

  return (
    <section aria-labelledby="specs-heading" className="flex flex-col gap-3">
      <h2 id="specs-heading" className="font-display text-h2 text-text">
        {t('specifications')}
      </h2>
      <table className="w-full border-collapse text-small">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-hairline last:border-0">
              <th
                scope="row"
                className="w-1/3 py-2 pr-4 text-left font-medium text-muted align-top"
              >
                {key}
              </th>
              <td className="py-2 text-text align-top">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
