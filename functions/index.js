const functions = require('firebase-functions');

const { syncSharePointSiteVisibility } = require('./sharepointVisibility');
const { provisionCompanyImpl } = require('./companyProvisioning');
const { createUser, deleteUser, updateUser } = require('./userAdmin');
const { requestSubscriptionUpgrade } = require('./billing');
const { setSuperadmin } = require('./superadmin');
const { adminFetchCompanyMembers, setCompanyStatus, setCompanyUserLimit, setCompanyName } = require('./companyAdmin');
const { purgeCompany } = require('./companyPurge');
const { devResetAdmin } = require('./devReset');

exports.syncSharePointSiteVisibility = functions.https.onCall(syncSharePointSiteVisibility);

exports.provisionCompany = functions.https.onCall(provisionCompanyImpl);
exports.provisionCompanyImpl = provisionCompanyImpl;

exports.createUser = functions.https.onCall(createUser);
exports.requestSubscriptionUpgrade = functions.https.onCall(requestSubscriptionUpgrade);
exports.setSuperadmin = functions.https.onCall(setSuperadmin);
exports.deleteUser = functions.https.onCall(deleteUser);
exports.updateUser = functions.https.onCall(updateUser);

exports.adminFetchCompanyMembers = functions.https.onCall(adminFetchCompanyMembers);
exports.setCompanyStatus = functions.https.onCall(setCompanyStatus);
exports.setCompanyUserLimit = functions.https.onCall(setCompanyUserLimit);
exports.setCompanyName = functions.https.onCall(setCompanyName);
exports.purgeCompany = functions.https.onCall(purgeCompany);

exports.devResetAdmin = functions.https.onCall(devResetAdmin);
