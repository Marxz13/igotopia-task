import { TONES, badgeStyle, type Tone } from '@/app/lib/tones';

// Status pill. Glyph is decorative (aria-hidden); the label carries the meaning.
export function Badge({
  tone,
  label,
  plain = false,
}: {
  tone: Tone;
  label: string;
  plain?: boolean;
}) {
  const glyph = TONES[tone].glyph;
  return (
    <span style={badgeStyle(tone, plain)}>
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {label}
    </span>
  );
}
