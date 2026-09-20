const nodemailer = require('nodemailer');
const dns = require('dns');

const customLookup = (hostname, options, callback) => {
  return dns.lookup(hostname, { family: 4 }, callback);
};

// Helper to resolve host to IPv4 address to prevent ENETUNREACH on IPv6-less hosts (Railway)
const resolveIPv4Host = async (hostname) => {
  if (!hostname || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
  return new Promise((resolve) => {
    dns.lookup(hostname, { family: 4 }, (err, address) => {
      if (!err && address) resolve(address);
      else resolve(hostname);
    });
  });
};

// Initialize transporter using SMTP variables from env
const getTransporter = async () => {
  const rawHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || '465', 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  const isConfigured =
    user && pass &&
    !user.includes('PLACEHOLDER') &&
    !user.includes('YOUR_SENDER');

  if (isConfigured) {
    const ipv4Host = await resolveIPv4Host(rawHost);
    return nodemailer.createTransport({
      host: ipv4Host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        servername: rawHost,
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    });
  }
  return null;
};

const { Resend } = require('resend');

// ─── Helper: send a mail ──────────────────────────────────────────────────────
const sendMail = async ({ to, subject, html }) => {
  // Option 1: Use Resend API if configured (HTTPS based - works 100% on Railway)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
      const senderName = process.env.EMAIL_FROM || 'Royal Zone';

      const { data, error } = await resend.emails.send({
        from: `${senderName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
      });

      if (error) {
        if (error.message && error.message.includes('testing emails')) {
          const resendAccountEmail = 'hafizrabiussaim@gmail.com';
          const retry = await resend.emails.send({
            from: `${senderName} <${fromEmail}>`,
            to: [resendAccountEmail],
            subject: `[Store Order Notification for: ${to}] ${subject}`,
            html: `<div style="background:#fff3cd;padding:12px;margin-bottom:15px;border:1px solid #ffeeba;border-radius:4px;"><strong>📢 Store Notification:</strong> Intended recipient was <code>${to}</code> (Store Owner: saimlinkedin0000@gmail.com).</div>` + html,
          });
          if (!retry.error) {
            console.log(`✉️  Resend email delivered to ${resendAccountEmail} for target: ${to}`);
            return;
          }
        }
        console.error(`❌ Resend email failed → ${to}:`, error.message);
      } else {
        console.log(`✉️  Resend email sent → ${to} | ID: ${data?.id}`);
      }
      return;
    } catch (err) {
      console.error(`❌ Resend error → ${to}:`, err.message);
    }
  }

  // Option 2: Fallback to SMTP
  const transporter = await getTransporter();
  if (transporter) {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM || 'Royal Zone'}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✉️  Email sent → ${to} | Subject: ${subject}`);
    } catch (err) {
      console.error(`❌ Email send failed → ${to}:`, err.message);
    }
  } else {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('📧 SIMULATED EMAIL (Configure SMTP in server/.env to send real emails)');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('════════════════════════════════════════════════════════════\n');
  }
};

// ─── Shared HTML helpers ──────────────────────────────────────────────────────
const emailHeader = `
  <div style="background-color:#0A0F1E;padding:28px 25px;text-align:center;border-bottom:3px solid #C9A96E;">
    <h1 style="margin:0;font-family:'Playfair Display',Georgia,serif;color:#fff;letter-spacing:3px;font-size:26px;">ROYAL ZONE</h1>
    <p style="margin:6px 0 0;color:#C9A96E;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;">Luxury Lifestyle Store</p>
  </div>
`;

const emailFooter = `
  <div style="background-color:#f5f5f5;padding:18px;text-align:center;font-size:12px;color:#888;border-top:1px solid #eee;">
    <p style="margin:0;">© ${new Date().getFullYear()} Royal Zone — Luxury Lifestyle. All rights reserved.</p>
    <p style="margin:4px 0 0;">This is an automated email. Please do not reply directly.</p>
  </div>
`;

// ─── Format items rows ────────────────────────────────────────────────────────
const itemsTable = (items) => {
  const rows = items.map(item => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:13px;">
        <strong>${item.title}</strong>
        ${item.size ? `<br><small style="color:#888;">Size: ${item.size}</small>` : ''}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${item.quantity}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">PKR ${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:15px;font-size:13px;">
      <thead>
        <tr style="background:#f9f9f9;">
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:left;">Product</th>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:center;">Qty</th>
          <th style="padding:8px;border-bottom:2px solid #ddd;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

// ─── Totals section ───────────────────────────────────────────────────────────
const totalsBlock = (order) => `
  <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:2px solid #ddd;margin-top:10px;">
    <tr>
      <td style="padding:5px 0;color:#666;">Subtotal:</td>
      <td style="padding:5px 0;text-align:right;">PKR ${order.subtotal.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="padding:5px 0;color:#666;">Shipping:</td>
      <td style="padding:5px 0;text-align:right;">${order.shippingCost === 0 ? 'FREE' : `PKR ${order.shippingCost.toLocaleString()}`}</td>
    </tr>
    <tr>
      <td style="padding:5px 0;color:#666;">Tax (17% GST):</td>
      <td style="padding:5px 0;text-align:right;">PKR ${order.tax.toLocaleString()}</td>
    </tr>
    <tr style="font-size:17px;font-weight:bold;color:#C9A96E;">
      <td style="padding:10px 0 5px;">Grand Total:</td>
      <td style="padding:10px 0 5px;text-align:right;">PKR ${order.total.toLocaleString()}</td>
    </tr>
  </table>
`;

// ─── Payment method badge ─────────────────────────────────────────────────────
const paymentBadge = (method) => {
  const badges = {
    cod: { label: 'Cash on Delivery', color: '#2e7d32', bg: '#e8f5e9' },
    bank: { label: 'Bank Transfer', color: '#1565c0', bg: '#e3f2fd' },
    easypaisa: { label: 'EasyPaisa', color: '#00796b', bg: '#e0f2f1' },
    card: { label: 'Card Payment', color: '#6a1b9a', bg: '#f3e5f5' },
  };
  const b = badges[method] || { label: method, color: '#333', bg: '#eee' };
  return `<span style="display:inline-block;padding:4px 14px;background:${b.bg};color:${b.color};border-radius:20px;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${b.label}</span>`;
};

// ─── Shipping address block ───────────────────────────────────────────────────
const addressBlock = (addr) => `
  <div style="background:#f9f9f9;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;line-height:1.7;">
    <strong style="font-size:14px;">${addr.name}</strong><br>
    ${addr.street}<br>
    ${addr.city}, ${addr.state} ${addr.zipCode || ''}<br>
    ${addr.country}<br>
    📞 ${addr.phone}
  </div>
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  1. OWNER NOTIFICATION EMAIL (sent on every new order)
//     Includes a 1-click "Verify Payment" button for easypaisa/bank
// ═══════════════════════════════════════════════════════════════════════════════
const sendOrderNotification = async (order, verifyToken = null) => {
  const ownerEmail = 'saimlinkedin0000@gmail.com';
  const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

  const isManualPayment = ['easypaisa', 'bank'].includes(order.paymentMethod);
  const verifyLink = verifyToken
    ? `${serverUrl}/api/orders/verify-payment/${verifyToken}`
    : null;

  const subject = `👑 New Order — ${order.orderNumber} | ${order.paymentMethod.toUpperCase()}`;

  const verifyButtonHtml = isManualPayment && verifyLink ? `
    <div style="margin:25px 0;text-align:center;background:#f0fff4;border:2px dashed #C9A96E;border-radius:10px;padding:20px;">
      <p style="font-size:14px;color:#333;margin:0 0 14px;font-weight:bold;">
        ${order.paymentMethod === 'easypaisa' ? '⚡ Customer selected EasyPaisa payment' : '🏦 Customer selected Bank Transfer'}
      </p>
      <p style="font-size:12px;color:#666;margin:0 0 16px;">
        Once you confirm you have received the payment, click the button below:
      </p>
      <a href="${verifyLink}"
         style="display:inline-block;background:linear-gradient(135deg,#C9A96E,#a07840);color:#fff;padding:16px 40px;border-radius:8px;font-weight:bold;text-decoration:none;font-size:15px;letter-spacing:1px;box-shadow:0 4px 12px rgba(201,169,110,0.4);">
        ✅ VERIFY PAYMENT — Mark as PAID
      </a>
      <p style="font-size:11px;color:#aaa;margin:12px 0 0;">
        This will mark the payment as verified and automatically send the customer a confirmation email.
      </p>
    </div>
  ` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #ddd;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      ${emailHeader}

      <div style="padding:28px 25px;background:#fff;color:#333;">
        <h2 style="margin-top:0;color:#0A0F1E;border-bottom:2px solid #C9A96E;padding-bottom:10px;font-size:20px;">
          📋 New Order Received
        </h2>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:#666;width:45%;">Order Number:</td>
            <td style="padding:6px 0;font-weight:bold;color:#C9A96E;font-size:16px;">${order.orderNumber}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#666;">Date:</td>
            <td style="padding:6px 0;">${new Date(order.createdAt).toLocaleString('en-PK')}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#666;">Payment Method:</td>
            <td style="padding:6px 0;">${paymentBadge(order.paymentMethod)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#666;">Payment Status:</td>
            <td style="padding:6px 0;font-weight:bold;color:${order.paymentStatus === 'paid' || order.paymentStatus === 'verified' ? '#2e7d32' : '#e65100'};">
              ${order.paymentStatus.toUpperCase()}
            </td>
          </tr>
          ${order.customerEmail ? `
          <tr>
            <td style="padding:6px 0;color:#666;">Customer Email:</td>
            <td style="padding:6px 0;">${order.customerEmail}</td>
          </tr>` : ''}
        </table>

        ${verifyButtonHtml}

        <h3 style="color:#0A0F1E;margin-bottom:10px;font-size:15px;">📦 Shipping Address</h3>
        ${addressBlock(order.shippingAddress)}

        <h3 style="color:#0A0F1E;margin-bottom:10px;font-size:15px;">🛍️ Ordered Items</h3>
        ${itemsTable(order.items)}
        ${totalsBlock(order)}

        ${order.notes ? `
        <div style="margin-top:20px;padding:12px 16px;background:#fff9c4;border-left:4px solid #fbc02d;border-radius:4px;font-size:13px;">
          <strong>📝 Customer Notes:</strong> ${order.notes}
        </div>` : ''}
      </div>

      ${emailFooter}
    </div>
  `;

  try {
    await sendMail({ to: ownerEmail, subject, html });
  } catch (err) {
    console.error('❌ Owner notification email failed:', err.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  2. CUSTOMER — PAYMENT PENDING EMAIL
//     Sent when customer places easypaisa/bank order
// ═══════════════════════════════════════════════════════════════════════════════
const sendCustomerPendingEmail = async (order, customerEmail) => {
  if (!customerEmail) return;

  const isPaisa = order.paymentMethod === 'easypaisa';
  const isBank = order.paymentMethod === 'bank';

  const paymentInstructions = isPaisa ? `
    <div style="background:#e0f2f1;border-left:4px solid #00796b;border-radius:6px;padding:16px 18px;margin:20px 0;font-size:13px;line-height:1.9;">
      <p style="margin:0 0 10px;font-weight:bold;color:#00796b;font-size:14px;">⚡ EasyPaisa Payment Details</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:3px 0;color:#555;width:45%;">📱 EasyPaisa Number:</td><td style="font-weight:bold;color:#00695c;">03367947525</td></tr>
        <tr><td style="padding:3px 0;color:#555;">🏦 IBAN:</td><td style="font-weight:bold;color:#00695c;font-size:12px;">PK39TMFB0000000042714749</td></tr>
        <tr><td style="padding:3px 0;color:#555;">💰 Amount:</td><td style="font-weight:bold;color:#C9A96E;font-size:15px;">PKR ${order.total.toLocaleString()}</td></tr>
      </table>
      <p style="margin:12px 0 0;color:#555;font-size:12px;">
        📸 After payment, send your <strong>transaction screenshot</strong> via WhatsApp to confirm your order.
      </p>
    </div>
  ` : isBank ? `
    <div style="background:#e3f2fd;border-left:4px solid #1565c0;border-radius:6px;padding:16px 18px;margin:20px 0;font-size:13px;line-height:1.9;">
      <p style="margin:0 0 10px;font-weight:bold;color:#1565c0;font-size:14px;">🏦 Bank Transfer Details</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:3px 0;color:#555;width:45%;">🏛️ Bank:</td><td style="font-weight:bold;">Bank AL Habib Limited</td></tr>
        <tr><td style="padding:3px 0;color:#555;">👤 Account Title:</td><td style="font-weight:bold;">AFAQ HAMZA</td></tr>
        <tr><td style="padding:3px 0;color:#555;">🔢 Account #:</td><td style="font-weight:bold;">01600981006190016</td></tr>
        <tr><td style="padding:3px 0;color:#555;">💳 IBAN:</td><td style="font-weight:bold;font-size:12px;">PK69BAHL0160098100619001</td></tr>
        <tr><td style="padding:3px 0;color:#555;">💰 Amount:</td><td style="font-weight:bold;color:#C9A96E;font-size:15px;">PKR ${order.total.toLocaleString()}</td></tr>
      </table>
      <p style="margin:12px 0 0;color:#555;font-size:12px;">
        📸 After transfer, send your <strong>payment receipt</strong> to our WhatsApp: <strong>+92-336-7947525</strong>
      </p>
    </div>
  ` : '';

  const subject = `⏳ Order #${order.orderNumber} Placed — Payment Pending | Royal Zone`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #ddd;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      ${emailHeader}

      <div style="padding:28px 25px;background:#fff;color:#333;">
        <h2 style="margin-top:0;color:#0A0F1E;font-size:20px;">Order Received — Awaiting Payment Verification</h2>
        <p style="color:#555;font-size:14px;line-height:1.7;">
          Dear <strong>${order.shippingAddress.name}</strong>,<br><br>
          Thank you for shopping at <strong>Royal Zone</strong>! Your order 
          <strong style="color:#C9A96E;">#${order.orderNumber}</strong> has been received.
          Please complete your payment and we will verify it shortly.
        </p>

        <div style="text-align:center;margin:20px 0;">
          <span style="display:inline-block;background:#fff3e0;color:#e65100;padding:10px 28px;border-radius:25px;font-weight:bold;font-size:14px;border:2px solid #ffb74d;">
            ⏳ PAYMENT PENDING VERIFICATION
          </span>
        </div>

        ${paymentInstructions}

        <h3 style="color:#0A0F1E;margin-bottom:10px;font-size:15px;border-top:1px solid #eee;padding-top:20px;">🛍️ Your Order</h3>
        ${itemsTable(order.items)}
        ${totalsBlock(order)}

        <h3 style="color:#0A0F1E;margin:20px 0 10px;font-size:15px;">📦 Delivery Address</h3>
        ${addressBlock(order.shippingAddress)}

        <div style="background:#f9f9f9;border-radius:8px;padding:14px 16px;font-size:13px;color:#555;line-height:1.7;margin-top:10px;">
          <strong>⏱️ What happens next?</strong><br>
          1. Complete your payment using the details above<br>
          2. Our team will verify your payment (usually within a few hours)<br>
          3. You will receive a <strong>Payment Confirmed</strong> email once verified<br>
          4. Your order will be dispatched within 1–2 business days
        </div>
      </div>

      ${emailFooter}
    </div>
  `;

  try {
    await sendMail({ to: customerEmail, subject, html });
  } catch (err) {
    console.error('❌ Customer pending email failed:', err.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  3. CUSTOMER — PAYMENT VERIFIED EMAIL
//     Sent when owner clicks "Verify Payment" link in their email
// ═══════════════════════════════════════════════════════════════════════════════
const sendCustomerPaymentVerifiedEmail = async (order) => {
  const customerEmail = order.customerEmail;
  if (!customerEmail) return;

  const subject = `✅ Payment Verified — Order #${order.orderNumber} is Confirmed! | Royal Zone`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #ddd;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      ${emailHeader}

      <div style="padding:28px 25px;background:#fff;color:#333;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:64px;line-height:1;">🎉</div>
          <h2 style="margin:12px 0 6px;color:#0A0F1E;font-size:22px;">Payment Verified!</h2>
          <p style="color:#555;font-size:14px;margin:0;">Your order is confirmed and being processed.</p>
        </div>

        <div style="text-align:center;margin:0 0 24px;">
          <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;padding:10px 28px;border-radius:25px;font-weight:bold;font-size:14px;border:2px solid #a5d6a7;">
            ✅ PAYMENT VERIFIED — ORDER CONFIRMED
          </span>
        </div>

        <p style="color:#555;font-size:14px;line-height:1.7;">
          Dear <strong>${order.shippingAddress.name}</strong>,<br><br>
          We have successfully verified your payment for order 
          <strong style="color:#C9A96E;">#${order.orderNumber}</strong>. 
          Your order is now being prepared for dispatch. 
          Expect delivery within <strong>3–5 working days</strong>.
        </p>

        <div style="background:#C9A96E15;border:1px solid #C9A96E50;border-radius:10px;padding:18px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 6px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Number</p>
          <p style="margin:0;color:#C9A96E;font-size:24px;font-weight:bold;font-family:'Playfair Display',Georgia,serif;">${order.orderNumber}</p>
          <p style="margin:8px 0 0;color:#555;font-size:13px;">Total Paid: <strong>PKR ${order.total.toLocaleString()}</strong></p>
        </div>

        <h3 style="color:#0A0F1E;margin-bottom:10px;font-size:15px;">🛍️ Order Summary</h3>
        ${itemsTable(order.items)}
        ${totalsBlock(order)}

        <h3 style="color:#0A0F1E;margin:20px 0 10px;font-size:15px;">📦 Delivery Address</h3>
        ${addressBlock(order.shippingAddress)}

        <div style="background:#f9f9f9;border-radius:8px;padding:14px 16px;font-size:13px;color:#555;line-height:1.7;margin-top:10px;">
          <strong>📞 Need Help?</strong><br>
          WhatsApp us at <strong>+92-336-7947525</strong> with your order number for any queries.
        </div>
      </div>

      ${emailFooter}
    </div>
  `;

  try {
    await sendMail({ to: customerEmail, subject, html });
  } catch (err) {
    console.error('❌ Customer verified email failed:', err.message);
  }
};

// ─── 4. COD Order Confirmation ────────────────────────────────────────────────
const sendCustomerCODEmail = async (order) => {
  const customerEmail = order.customerEmail;
  if (!customerEmail) return;

  const subject = `🎉 Order Confirmed — #${order.orderNumber} | Royal Zone`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #ddd;border-radius:10px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
      ${emailHeader}
      <div style="padding:28px 25px;background:#fff;color:#333;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:64px;line-height:1;">📦</div>
          <h2 style="margin:12px 0 6px;color:#0A0F1E;font-size:22px;">Order Confirmed!</h2>
          <p style="color:#555;font-size:14px;margin:0;">Your order has been placed successfully.</p>
        </div>

        <div style="text-align:center;margin:0 0 24px;">
          <span style="display:inline-block;background:#e8f5e9;color:#2e7d32;padding:10px 28px;border-radius:25px;font-weight:bold;font-size:14px;border:2px solid #a5d6a7;">
            ✅ ORDER CONFIRMED — CASH ON DELIVERY
          </span>
        </div>

        <p style="color:#555;font-size:14px;line-height:1.7;">
          Dear <strong>${order.shippingAddress.name}</strong>,<br><br>
          Your order <strong style="color:#C9A96E;">#${order.orderNumber}</strong> has been confirmed. 
          Please keep <strong>PKR ${order.total.toLocaleString()}</strong> ready at time of delivery.
          Expected delivery: <strong>3–5 working days</strong>.
        </p>

        <div style="background:#C9A96E15;border:1px solid #C9A96E50;border-radius:10px;padding:18px;text-align:center;margin:20px 0;">
          <p style="margin:0 0 6px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Number</p>
          <p style="margin:0;color:#C9A96E;font-size:24px;font-weight:bold;">${order.orderNumber}</p>
          <p style="margin:8px 0 0;color:#555;font-size:13px;">Amount to Pay on Delivery: <strong>PKR ${order.total.toLocaleString()}</strong></p>
        </div>

        <h3 style="color:#0A0F1E;margin-bottom:10px;font-size:15px;">🛍️ Order Summary</h3>
        ${itemsTable(order.items)}
        ${totalsBlock(order)}

        <h3 style="color:#0A0F1E;margin:20px 0 10px;font-size:15px;">📦 Delivery Address</h3>
        ${addressBlock(order.shippingAddress)}
      </div>
      ${emailFooter}
    </div>
  `;

  try {
    await sendMail({ to: customerEmail, subject, html });
  } catch (err) {
    console.error('❌ Customer COD email failed:', err.message);
  }
};

module.exports = {
  sendOrderNotification,
  sendCustomerPendingEmail,
  sendCustomerPaymentVerifiedEmail,
  sendCustomerCODEmail,
};
