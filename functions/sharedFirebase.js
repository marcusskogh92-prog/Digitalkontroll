const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const KEEP_COMPANY_ID = 'MS Byggsystem';

module.exports = {
  admin,
  db,
  FieldValue,
  IS_EMULATOR,
  KEEP_COMPANY_ID,
};
