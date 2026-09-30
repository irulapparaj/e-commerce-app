// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkinProvider, useSkin } from './SkinProvider';

function Probe() {
  const { skin } = useSkin();
  return <output data-testid="skin">{skin}</output>;
}

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
};

describe('SkinProvider', () => {
  beforeEach(() => {
    delete document.documentElement.dataset['skin'];
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the default skin without a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('skin')).toHaveTextContent('classic');
  });

  it('restores a stored skin when the server sent no hint', () => {
    window.localStorage.setItem('skin', 'pushpa-purity');
    render(
      <SkinProvider initialSkin={null}>
        <Probe />
      </SkinProvider>,
    );
    expect(screen.getByTestId('skin')).toHaveTextContent('pushpa-purity');
    expect(document.documentElement.dataset['skin']).toBe('pushpa-purity');
  });

  it('trusts the server hint and leaves the server-rendered attribute alone', () => {
    window.localStorage.setItem('skin', 'pushpa-purity');
    render(
      <SkinProvider initialSkin="sandhya-aarti">
        <Probe />
      </SkinProvider>,
    );
    expect(screen.getByTestId('skin')).toHaveTextContent('sandhya-aarti');
    expect(document.documentElement.dataset['skin']).toBeUndefined();
  });

  it('survives storage access throwing', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    try {
      render(
        <SkinProvider initialSkin={null}>
          <Probe />
        </SkinProvider>,
      );
      expect(screen.getByTestId('skin')).toHaveTextContent('classic');
    } finally {
      if (descriptor !== undefined) Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });
});
