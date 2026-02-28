/**
 * Mobilnummer: format xxx xxx xx xx (svenskt 10-siffersformat).
 * Sparas som endast siffror; använd denna för visning och vid inmatning.
 */

/** Formatera mobil (endast siffror) till xxx xxx xx xx t.ex. 072 595 75 25 (max 10 siffror). */
export function formatMobileDisplay(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  const parts = [p1, p2, p3, p4].filter(Boolean);
  return parts.join(' ').trim();
}

/** Ta bort alla icke-siffror och begränsa till 10 siffror (för lagring/state). */
export function mobileDigitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10);
}
