'use client';

import { useState } from 'react';

import type { FaqItem } from '@/lib/content/faq';

interface FaqProps {
  readonly items: readonly FaqItem[];
}

export function Faq({ items }: FaqProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <dl className="divide-y divide-hairline">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        const triggerId = `faq-trigger-${index}`;

        return (
          <div key={item.question} className="py-4">
            <dt>
              <button
                id={triggerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-start justify-between text-left gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                onClick={() => toggle(index)}
              >
                <span className="font-medium text-text">{item.question}</span>
                <span
                  className="mt-0.5 shrink-0 text-muted transition-transform duration-200"
                  aria-hidden="true"
                  style={{ transform: isOpen ? 'rotate(45deg)' : 'none' }}
                >
                  +
                </span>
              </button>
            </dt>
            <dd
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className="mt-3 leading-relaxed text-muted"
            >
              {item.answer}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
