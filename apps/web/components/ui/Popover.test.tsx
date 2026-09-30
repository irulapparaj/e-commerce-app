// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Popover } from './Popover';

function Harness({ align }: { readonly align?: 'start' | 'end' }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="outside">
        outside
      </button>
      <div ref={anchorRef} className="relative">
        <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
          open
        </button>
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          {...(align === undefined ? {} : { align })}
        >
          <p>panel</p>
        </Popover>
      </div>
    </div>
  );
}

const openPopover = () => {
  fireEvent.click(screen.getByTestId('trigger'));
  return screen.getByTestId('popover');
};

describe('Popover', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByTestId('popover')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<Harness />);
    openPopover();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('popover')).not.toBeInTheDocument();
  });

  it('closes on a pointer press outside the anchor but not inside it', () => {
    render(<Harness />);
    const panel = openPopover();
    fireEvent.pointerDown(panel);
    expect(screen.getByTestId('popover')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('popover')).not.toBeInTheDocument();
  });

  it('aligns to the requested edge', () => {
    render(<Harness align="end" />);
    expect(openPopover().className).toContain('right-0');
  });
});
