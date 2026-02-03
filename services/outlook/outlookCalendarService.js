/**
 * Outlook calendar service (stubs).
 *
 * DigitalKontroll is source of truth; Outlook is synced only via explicit actions.
 * These functions are called when the user chooses to cancel or update an Outlook event.
 *
 * TODO: Replace with real Microsoft Graph / Outlook API when backend is ready.
 */

/**
 * Cancel (avboka) an Outlook event by its event ID.
 * Called when user chooses "Radera datumet och avboka mötet i Outlook".
 *
 * @param {string} outlookEventId - The Outlook event ID
 * @returns {Promise<void>}
 */
export async function cancelOutlookEvent(outlookEventId) {
  const id = outlookEventId != null ? String(outlookEventId).trim() : '';
  if (!id) return;
  // Stub: no-op. Replace with actual Microsoft Graph DELETE when integrated.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[outlookCalendarService] cancelOutlookEvent stub', id);
  }
}

/**
 * Update an existing Outlook event (date, time, title, etc.).
 * Called when user saves changes to a date that has outlookEventId.
 *
 * @param {string} eventId - The Outlook event ID
 * @param {object} payload - { date, startTime, endTime, title, description, ... }
 * @returns {Promise<void>}
 */
export async function updateOutlookEvent(eventId, payload) {
  const id = eventId != null ? String(eventId).trim() : '';
  if (!id) return;
  // Stub: no-op. Replace with actual Microsoft Graph PATCH when integrated.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[outlookCalendarService] updateOutlookEvent stub', id, payload);
  }
}
