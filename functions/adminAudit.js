const { db, FieldValue } = require('./sharedFirebase');

async function logAdminAuditEvent(event) {
  try {
    const payload = Object.assign(
      {
        ts: FieldValue.serverTimestamp(),
      },
      event || {}
    );
    await db.collection('admin_audit').add(payload);
  } catch (e) {
    console.warn('logAdminAuditEvent failed', e && e.message ? e.message : e);
  }
}

module.exports = {
  logAdminAuditEvent,
};
