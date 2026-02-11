/**
 * Formaterar organisationsnummer till standardformat xxxxxx-xxxx (6 siffror, bindestreck, 4 siffror).
 * Tar bort alla icke-siffror och begränsar till 10 siffror.
 * @param {string} input - Rå inmatning (t.ex. "1234567890" eller "123456-7890")
 * @returns {string} Formaterat värde, t.ex. "123456-7890"
 */
export function formatOrganizationNumber(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  const limited = digits.slice(0, 10);
  if (limited.length <= 6) return limited;
  return limited.slice(0, 6) + '-' + limited.slice(6, 10);
}
