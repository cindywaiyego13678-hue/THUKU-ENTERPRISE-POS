// ============================================================
// Payment prompt messages sent/shown to customers, plus small
// helpers to copy or WhatsApp them from the POS payment dialog.
//
// EDIT THIS with the shop's real Paybill and Pochi details:
// ============================================================
const SHOP_PAYMENT = {
  shopName: 'Thuku Enterprise',
  paybillNumber: '247247',   // e.g. '400200'
  paybillAccount: '0766222121',                // account number/name customers type in
  pochiNumber: '0713181257',              // the shop's Pochi la Biashara phone number
};

/*
 * The exact wording customers see, per payment method.
 * Called both to display on-screen (paybill_stk while waiting, in case the
 * prompt is missed) and to copy/WhatsApp to the customer (paybill_code, pochi).
 */
function buildPaymentInstructions(channel, total) {
  const amount = Number(total).toLocaleString();

  if (channel === 'paybill') {
    return (
      `Hi! Please pay Ksh ${amount} for your purchase at ${SHOP_PAYMENT.shopName}:\n\n` +
      `M-Pesa menu > Lipa na M-Pesa > Paybill\n` +
      `Business No: ${SHOP_PAYMENT.paybillNumber}\n` +
      `Account No: ${SHOP_PAYMENT.paybillAccount}\n` +
      `Amount: Ksh ${amount}\n\n` +
      `Please send me the M-Pesa confirmation code once you've paid. Thank you!`
    );
  }

  if (channel === 'pochi') {
    return (
      `Hi! Please pay Ksh ${amount} for your purchase at ${SHOP_PAYMENT.shopName}:\n\n` +
      `M-Pesa menu > Send Money > ${SHOP_PAYMENT.pochiNumber}\n` +
      `(or Lipa na M-Pesa > Pochi la Biashara > ${SHOP_PAYMENT.pochiNumber})\n` +
      `Amount: Ksh ${amount}\n\n` +
      `Please send me the M-Pesa confirmation code once you've paid. Thank you!`
    );
  }

  return `Please pay Ksh ${amount} via M-Pesa. Thank you!`;
}

function normalizeWaNumber(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('0') && p.length === 10) p = '254' + p.slice(1);
  return p;
}

/* Opens WhatsApp with the message pre-filled. With no phone, opens the
   contact picker in the WhatsApp app so the cashier can choose a chat. */
function openWhatsappWith(phone, text) {
  const p = normalizeWaNumber(phone);
  const url = p
    ? `https://wa.me/${p}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // Fallback for contexts without the Clipboard API (e.g. non-HTTPS)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}
