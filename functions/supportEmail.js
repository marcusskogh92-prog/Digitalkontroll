const nodemailer = require('nodemailer');
const { getSmtpConfig } = require('./sharedConfig');

async function sendSupportEmail({ to, subject, text }) {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass || !smtp.from) {
    return { ok: false, skipped: true, reason: 'SMTP not configured' };
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transport.sendMail({ from: smtp.from, to, subject, text });
  return { ok: true };
}

module.exports = {
  sendSupportEmail,
};
