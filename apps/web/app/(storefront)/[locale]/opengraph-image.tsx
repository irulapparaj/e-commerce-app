import { brand } from '@pe/shared';
import { ImageResponse } from 'next/og';

import { OG_PALETTE } from '@/lib/theme';

export const alt = brand.name;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PADDING = 96;
const NAME_SIZE = 96;
const TAGLINE_SIZE = 40;
const RULE_WIDTH = 120;

/** Placeholder share card: wordmark and tagline on the warm ground; the real brand swaps in later. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: PADDING,
        background: OG_PALETTE.bg,
        color: OG_PALETTE.text,
        fontFamily: 'serif',
      }}
    >
      <div style={{ width: RULE_WIDTH, height: 4, background: OG_PALETTE.accent }} />
      <div style={{ marginTop: 32, fontSize: NAME_SIZE, fontWeight: 500, letterSpacing: -2 }}>
        {brand.name}
      </div>
      <div style={{ marginTop: 16, fontSize: TAGLINE_SIZE, color: OG_PALETTE.muted }}>
        {brand.tagline}
      </div>
    </div>,
    size,
  );
}
