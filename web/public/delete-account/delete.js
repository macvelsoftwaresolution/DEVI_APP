// Account deletion page: WhatsApp code, then POST /api/auth/account/delete (backend/src/routes/auth.routes.js)
(function () {
  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API = local ? 'http://localhost:5005/api' : 'https://devi-api.macvelsoftware.com/api';

  var $ = function (id) { return document.getElementById(id); };
  var phoneStep = $('phone-step');
  var codeStep = $('code-step');
  var msg = $('msg');
  var phone = '';

  function show(text, kind) {
    msg.textContent = text;
    msg.className = 'msg ' + (kind || 'error');
    msg.hidden = !text;
  }

  // "98765 43210" -> "+919876543210"; anything with + is sent as typed, the server checks it
  function cleanPhone(raw) {
    var s = String(raw || '').replace(/[\s()-]/g, '');
    if (/^0?\d{10}$/.test(s)) return '+91' + s.slice(-10);
    if (/^91\d{10}$/.test(s)) return '+' + s;
    return s;
  }

  function post(path, body) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok && data.success === true, status: res.status, message: data.message };
      });
    }, function () {
      return { ok: false, status: 0, message: 'Could not reach DEVI. Check your internet and try again.' };
    });
  }

  phoneStep.addEventListener('submit', function (e) {
    e.preventDefault();
    phone = cleanPhone($('phone').value);
    if (!/^\+\d{8,15}$/.test(phone)) return show('Enter your mobile number with the country code.');
    var btn = $('send-btn');
    btn.disabled = true;
    show('');
    post('/auth/otp/send', { phone: phone, purpose: 'login' }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) return show(r.message || 'Could not send the code. Please try again.');
      $('phone-shown').textContent = phone;
      phoneStep.hidden = true;
      codeStep.hidden = false;
      $('otp').focus();
      show('Code sent on WhatsApp.', 'ok');
    });
  });

  function updateDeleteButton() {
    $('delete-btn').disabled = !($('confirm').checked && /^\d{6}$/.test($('otp').value.trim()));
  }
  $('confirm').addEventListener('change', updateDeleteButton);
  $('otp').addEventListener('input', updateDeleteButton);

  $('back-btn').addEventListener('click', function () {
    codeStep.hidden = true;
    phoneStep.hidden = false;
    $('otp').value = '';
    $('confirm').checked = false;
    updateDeleteButton();
    show('');
  });

  codeStep.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('delete-btn');
    btn.disabled = true;
    show('');
    post('/auth/account/delete', { phone: phone, otp: $('otp').value.trim() }).then(function (r) {
      if (!r.ok) {
        updateDeleteButton();
        return show(r.message || 'Could not delete your account. Please try again.');
      }
      codeStep.hidden = true;
      show('Your DEVI account and its data have been deleted. You can uninstall the app.', 'ok');
    });
  });
})();
