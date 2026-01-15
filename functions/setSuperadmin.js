const admin = require('firebase-admin');

// Usage: node setSuperadmin.js user@example.com
// Requires service account credentials in GOOGLE_APPLICATION_CREDENTIALS

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node setSuperadmin.js user@example.com');
    process.exit(2);
  }
  admin.initializeApp();
  try {
    const user = await admin.auth().getUserByEmail(email);
    console.log('Found user', user.uid);
    await admin.auth().setCustomUserClaims(user.uid, { superadmin: true, role: 'superadmin', admin: true });
    console.log('Set superadmin for', email);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();
