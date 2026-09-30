'use client';

import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react';

import { cx } from './cx';

interface TabsContextValue {
  readonly value: string;
  readonly select: (value: string) => void;
  readonly baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

const useTabs = (): TabsContextValue => {
  const context = useContext(TabsContext);
  if (context === null) throw new Error('Tabs.* must be used inside <Tabs>');
  return context;
};

interface TabsProps {
  readonly children: ReactNode;
  readonly defaultValue: string;
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
}

/** Automatic activation: arrows move focus and select; Home/End jump. */
export function Tabs({ children, defaultValue, value, onValueChange }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const baseId = useId();
  const current = value ?? internal;
  const context = useMemo<TabsContextValue>(
    () => ({
      value: current,
      baseId,
      select: (next) => {
        setInternal(next);
        onValueChange?.(next);
      },
    }),
    [current, baseId, onValueChange],
  );
  return <TabsContext.Provider value={context}>{children}</TabsContext.Provider>;
}

const KEY_MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

interface TabListProps {
  readonly children: ReactNode;
  readonly label: string;
}

function TabList({ children, label }: TabListProps) {
  const { select } = useTabs();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = KEY_MOVES[event.key];
    if (move === undefined) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    const next = tabs[move(index, tabs.length)];
    if (next === undefined) return;
    next.focus();
    select(next.dataset['value'] ?? '');
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-6 overflow-x-auto border-b border-hairline"
    >
      {children}
    </div>
  );
}

interface TabProps {
  readonly value: string;
  readonly children: ReactNode;
}

function Tab({ value, children }: TabProps) {
  const { value: selected, select, baseId } = useTabs();
  const active = selected === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      data-value={value}
      onClick={() => select(value)}
      className={cx(
        '-mb-px min-h-touch border-b-2 px-1 text-base font-medium transition-colors duration-fast ease-out',
        active ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

interface TabPanelProps {
  readonly value: string;
  readonly children: ReactNode;
}

function TabPanel({ value, children }: TabPanelProps) {
  const { value: selected, baseId } = useTabs();
  const active = selected === value;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      hidden={!active}
      className="py-6"
    >
      {active && children}
    </div>
  );
}

Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;
