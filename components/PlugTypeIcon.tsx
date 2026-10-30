import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What the socket on the wall looks like.
 *
 * 「另外要附圖片」. 「A/B 型插座」 is an answer for somebody who already knows the
 * letters, and almost nobody does — the whole question is 「will my plug go in
 * that hole」, which is a question about a shape.
 *
 * Drawn here rather than fetched. These are fourteen schematic socket faces
 * that will never change; an image service would mean a request, a licence and
 * a thing that can fail to load, for a picture this file can describe in a few
 * coordinates. Nothing here is photographic — it is the hole pattern, which is
 * the part being matched against the plug in somebody's hand.
 */

interface Props {
  /** IEC letter: A, B, C, D, E, F, G, I, J, K, L, M, N, O. */
  type: string;
  size?: number;
  className?: string;
}

/** The holes, per type, on a 48×48 face. */
const FACES: Record<string, React.ReactNode> = {
  // Two flat blades.
  A: <>
    <rect x="15" y="17" width="4" height="13" rx="1.4" />
    <rect x="29" y="17" width="4" height="13" rx="1.4" />
  </>,
  // Two blades and a round earth below.
  B: <>
    <rect x="15" y="14" width="4" height="13" rx="1.4" />
    <rect x="29" y="14" width="4" height="13" rx="1.4" />
    <circle cx="24" cy="34" r="4" />
  </>,
  // Two round pins — the European two-pin.
  C: <>
    <circle cx="17" cy="24" r="4.2" />
    <circle cx="31" cy="24" r="4.2" />
  </>,
  // Three large round pins in a triangle.
  D: <>
    <circle cx="24" cy="14" r="4.6" />
    <circle cx="16" cy="31" r="4.6" />
    <circle cx="32" cy="31" r="4.6" />
  </>,
  // Two round pins with an earth pin standing above them.
  E: <>
    <circle cx="17" cy="27" r="4.2" />
    <circle cx="31" cy="27" r="4.2" />
    <rect x="21.5" y="10" width="5" height="8" rx="2.5" />
  </>,
  // Two round pins with earth clips at the sides.
  F: <>
    <circle cx="17" cy="24" r="4.2" />
    <circle cx="31" cy="24" r="4.2" />
    <rect x="20" y="9" width="8" height="3" rx="1.5" />
    <rect x="20" y="36" width="8" height="3" rx="1.5" />
  </>,
  // Three rectangular pins — the British plug.
  G: <>
    <rect x="21.5" y="11" width="5" height="10" rx="1.4" />
    <rect x="11" y="28" width="11" height="5" rx="1.4" />
    <rect x="26" y="28" width="11" height="5" rx="1.4" />
  </>,
  // Two slanted blades over a vertical earth.
  I: <>
    <rect x="14" y="14" width="4" height="11" rx="1.4" transform="rotate(-30 16 19)" />
    <rect x="30" y="14" width="4" height="11" rx="1.4" transform="rotate(30 32 19)" />
    <rect x="22" y="29" width="4" height="10" rx="1.4" />
  </>,
  // Three round pins, the third offset — Switzerland.
  J: <>
    <circle cx="17" cy="20" r="4" />
    <circle cx="31" cy="20" r="4" />
    <circle cx="24" cy="34" r="4" />
  </>,
  // Two round pins over an earth pin — Denmark.
  K: <>
    <circle cx="17" cy="20" r="4.2" />
    <circle cx="31" cy="20" r="4.2" />
    <path d="M19 32h10a5 5 0 0 1-10 0z" />
  </>,
  // Three round pins in a row — Italy.
  L: <>
    <circle cx="13" cy="24" r="3.8" />
    <circle cx="24" cy="24" r="3.8" />
    <circle cx="35" cy="24" r="3.8" />
  </>,
  // The large three-pin triangle — South Africa.
  M: <>
    <circle cx="24" cy="13" r="5.4" />
    <circle cx="14" cy="32" r="5.4" />
    <circle cx="34" cy="32" r="5.4" />
  </>,
  // Two pins over an earth — Brazil.
  N: <>
    <circle cx="16" cy="22" r="4" />
    <circle cx="32" cy="22" r="4" />
    <circle cx="24" cy="35" r="4" />
  </>,
  // Three round pins in a triangle, smaller — Thailand.
  O: <>
    <circle cx="16" cy="21" r="4" />
    <circle cx="32" cy="21" r="4" />
    <circle cx="24" cy="35" r="4" />
  </>,
};

const PlugTypeIcon: React.FC<Props> = ({ type, size = 44, className = '' }) => {
  const { t } = useTranslation();
  const face = FACES[type.toUpperCase()];
  // An unknown letter draws nothing rather than a blank plate that reads as a
  // socket with no holes.
  if (!face) return null;

  return (
    <svg
      data-testid={`plug-type-${type.toUpperCase()}`}
      role="img"
      aria-label={t('plan.power.socketAria', { type: type.toUpperCase() })}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
    >
      <rect x="1" y="1" width="46" height="46" rx="13" fill="#ffffff" stroke="#e2e0f0" strokeWidth="2" />
      <g fill="#11183d">{face}</g>
    </svg>
  );
};

export default PlugTypeIcon;
