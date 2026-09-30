'use client';

import { createContext, type ReactNode, useContext, useId, useMemo, useState } from 'react';

import { cx } from './cx';
import { Icon } from './Icon';

interface AccordionContextValue {
  readonly isOpen: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly headingLevel: 2 | 3 | 4;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

const useAccordion = (): AccordionContextValue => {
  const context = useContext(AccordionContext);
  if (context === null) throw new Error('Accordion.Item must be used inside <Accordion>');
  return context;
};

interface AccordionProps {
  readonly children: ReactNode;
  /** `single` closes the others when one opens (FAQ); `multiple` is for navigation trees. */
  readonly type?: 'single' | 'multiple';
  readonly defaultOpen?: readonly string[];
  readonly headingLevel?: 2 | 3 | 4;
}

const toggled = (open: readonly string[], id: string, single: boolean): readonly string[] => {
  if (open.includes(id)) return open.filter((item) => item !== id);
  return single ? [id] : [...open, id];
};

export function Accordion({
  children,
  type = 'single',
  defaultOpen = [],
  headingLevel = 3,
}: AccordionProps) {
  const [open, setOpen] = useState<readonly string[]>(defaultOpen);
  const value = useMemo<AccordionContextValue>(
    () => ({
      isOpen: (id) => open.includes(id),
      toggle: (id) => setOpen((current) => toggled(current, id, type === 'single')),
      headingLevel,
    }),
    [open, type, headingLevel],
  );
  return (
    <AccordionContext.Provider value={value}>
      <div className="border-t border-hairline">{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  readonly id: string;
  readonly title: ReactNode;
  readonly children: ReactNode;
}

function AccordionItem({ id, title, children }: AccordionItemProps) {
  const { isOpen, toggle, headingLevel } = useAccordion();
  const baseId = useId();
  const open = isOpen(id);
  const buttonId = `${baseId}-button`;
  const panelId = `${baseId}-panel`;
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="border-b border-hairline" data-testid={`accordion-item-${id}`}>
      <Heading className="text-base font-medium">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => toggle(id)}
          className="flex min-h-touch w-full items-center justify-between gap-4 py-2 text-left text-text hover:text-muted"
        >
          <span>{title}</span>
          <Icon name="chevron" size={16} direction={open ? 'up' : 'down'} className="text-muted" />
        </button>
      </Heading>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className={cx('pb-4 text-base text-muted', open && 'motion-safe:animate-fade-in')}
      >
        {children}
      </div>
    </div>
  );
}

Accordion.Item = AccordionItem;
