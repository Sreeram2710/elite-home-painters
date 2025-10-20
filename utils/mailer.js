const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  logger: process.env.NODE_ENV !== 'production',
  debug: String(process.env.NODEMAILER_DEBUG) === '1',
});

async function verifyTransport() {
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified.');
  } catch (err) {
    console.error('❌ SMTP verify failed:', err);
  }
}

function parseAdminEmails() {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!list.length) console.warn('⚠️ No ADMIN_EMAILS set in .env');
  return list;
}

function newQuoteHtml(quote) {
  const safe = (v) => String(v ?? '').replace(/</g, '&lt;');
  return `
    <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
      <h2>🧾 New Quote Request</h2>
      <p><b>Name:</b> ${safe(quote.name)}</p>
      <p><b>Email:</b> ${safe(quote.email)}</p>
      <p><b>Phone:</b> ${safe(quote.phone)}</p>
      <p><b>Service:</b> ${safe(quote.paintType)}</p>
      <p><b>Address:</b> ${safe(quote.address)}</p>
      <p><b>Message:</b><br>${safe(quote.message)}</p>
      <hr/>
      <p><small>Sent ${new Date().toLocaleString()}</small></p>
    </div>
  `;
}

async function sendNewQuoteAdmin(quote, opts = {}) {
  const toList = parseAdminEmails();
  if (!toList.length) throw new Error('ADMIN_EMAILS not configured');

  const fromName = process.env.FROM_NAME || 'EliteHomePainters';
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

  const subject = `New Quote: ${quote.name || 'Customer'} - ${quote.paintType || 'Service'}`;
  const html = newQuoteHtml(quote);

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toList,
    subject,
    html,
    replyTo: quote.email || undefined,
    ...(opts.cc ? { cc: opts.cc } : {}),
    ...(opts.bcc ? { bcc: opts.bcc } : {}),
  });

  console.log('📨 Email accepted by SMTP:', info.messageId);
  return info;
}

module.exports = {
  transporter,
  verifyTransport,
  sendNewQuoteAdmin,
};
