const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ✅ دعم GET للاختبار (يعرض نموذجاً تجريبياً)
  if (req.method === 'GET') {
    return res.status(200).json({
      message: '✅ API يعمل! استخدم POST لإرسال بيانات الحجز.',
      example: {
        method: 'POST',
        body: {
          clinicName: 'عيادتي',
          patientName: 'أحمد محمد',
          patientPhone: '+966512345678',
          serviceName: 'فحص عام',
          date: '2026-07-30',
          time: '14:30',
          code: 'RE-1234'
        }
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      clinicName = 'العيادة الذكية',
      doctorName = '',
      patientName = '',
      patientPhone = '',
      serviceName = '',
      date = '',
      time = '',
      code = '',
      supportEmail = 'alkhyatalkhyat79@gmail.com'
    } = req.body || {};

    // تنسيق التاريخ
    let formattedDate = date;
    try {
      const d = new Date(date);
      formattedDate = d.toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (_) {}

    // QR
    const qrData = `RESERVATION:${code}\nPATIENT:${patientName}\nPHONE:${patientPhone}\nDATE:${date}\nTIME:${time}\nCLINIC:${clinicName}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&color=0F172A&bgcolor=FFFFFF&margin=2&ecc=H`;

    const subTitle = doctorName ? `تحت إشراف د. ${doctorName}` : 'الحجز الرسمي للموعد الطبي';

    // HTML التصميم الزجاجي الفاخر
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', sans-serif; background: linear-gradient(135deg, #0a1628 0%, #1a2b47 50%, #0a1628 100%); padding: 40px; width: 900px; }
    .card { width: 820px; background: linear-gradient(180deg, rgba(15,42,60,0.98) 0%, rgba(20,50,70,0.98) 100%); border-radius: 24px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); margin: 0 auto; }
    .header { background: linear-gradient(135deg, #065f46 0%, #047857 40%, #059669 100%); padding: 32px 40px; display: flex; justify-content: space-between; align-items: center; flex-direction: row-reverse; box-shadow: inset 0 -1px 0 rgba(255,255,255,0.1); }
    .logo-section { display: flex; align-items: center; flex-direction: row-reverse; }
    .logo-box { background: #ffffff; width: 72px; height: 72px; border-radius: 16px; display: flex; justify-content: center; align-items: center; box-shadow: 0 8px 24px rgba(0,0,0,0.3); margin-left: 20px; }
    .logo-box span { font-size: 44px; color: #047857; font-weight: 900; line-height: 1; }
    .clinic-info { text-align: right; }
    .clinic-label { font-size: 11px; color: rgba(255,255,255,0.9); font-weight: 700; letter-spacing: 3px; display: block; margin-bottom: 6px; }
    .clinic-name { font-size: 32px; font-weight: 700; color: #ffffff; line-height: 1; }
    .clinic-sub { font-size: 13px; color: rgba(255,255,255,0.85); font-weight: 500; margin-top: 6px; display: block; }
    .confirmed-badge { background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.35); border-radius: 100px; padding: 10px 22px; display: flex; align-items: center; flex-direction: row-reverse; backdrop-filter: blur(10px); }
    .confirmed-dot { background: #10ff90; width: 10px; height: 10px; border-radius: 50%; margin-left: 10px; box-shadow: 0 0 12px #10ff90; }
    .confirmed-text { font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: 1px; }
    .ref-bar { background: linear-gradient(90deg, rgba(30,50,70,0.6), rgba(40,60,80,0.6)); padding: 22px 40px; display: flex; justify-content: space-between; align-items: center; flex-direction: row-reverse; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .ref-label { font-size: 11px; color: rgba(255,255,255,0.6); font-weight: 700; letter-spacing: 2px; display: block; }
    .ref-sub { font-size: 12px; color: rgba(255,255,255,0.5); font-weight: 500; margin-top: 4px; display: block; }
    .code-box { background: linear-gradient(135deg, #1e293b, #0f172a); padding: 12px 28px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
    .code-text { font-size: 26px; font-weight: 700; color: #10ff90; letter-spacing: 3px; font-family: 'Tajawal', monospace; }
    .body { padding: 30px 40px; }
    .section-title { font-size: 11px; color: #10ff90; font-weight: 700; letter-spacing: 2px; margin-bottom: 12px; text-align: right; display: block; }
    .info-row { display: flex; justify-content: space-between; align-items: center; padding: 16px 22px; background: linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03)); border-radius: 12px; border-right: 3px solid #10ff90; margin-bottom: 10px; flex-direction: row-reverse; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
    .info-label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.6); }
    .info-value { font-size: 22px; font-weight: 700; color: #ffffff; text-align: left; }
    .info-value-phone { font-size: 18px; font-weight: 700; color: #ffffff; font-family: 'Tajawal', monospace; direction: ltr; text-align: left; }
    .service-row { background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1)); border-right: 3px solid #10ff90; }
    .service-value { font-size: 22px; font-weight: 700; color: #10ff90; }
    .schedule-box { background: linear-gradient(135deg, #78350f 0%, #a16207 50%, #ca8a04 100%); border-radius: 16px; border: 2px solid rgba(251,191,36,0.5); box-shadow: 0 15px 40px rgba(202,138,4,0.4), inset 0 1px 0 rgba(255,255,255,0.4); padding: 26px 30px; }
    .schedule-title { font-size: 11px; color: #fbbf24; font-weight: 700; letter-spacing: 2px; margin-bottom: 14px; display: block; text-align: right; }
    .schedule-row { display: flex; justify-content: space-between; align-items: center; flex-direction: row-reverse; margin-bottom: 12px; }
    .schedule-label { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.95); letter-spacing: 1px; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
    .schedule-date { font-size: 20px; font-weight: 700; color: #ffffff; text-align: left; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .schedule-divider { width: 100%; height: 1px; background: rgba(255,255,255,0.25); margin: 6px 0 12px 0; }
    .schedule-time { font-size: 42px; font-weight: 700; color: #fef3c7; font-family: 'Tajawal', monospace; letter-spacing: 2px; line-height: 1; text-align: left; direction: ltr; text-shadow: 0 3px 6px rgba(0,0,0,0.4); }
    .qr-section { padding: 22px 26px; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04)); border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); display: flex; justify-content: space-between; align-items: center; flex-direction: row-reverse; margin-top: 20px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); }
    .qr-info { text-align: right; }
    .qr-title { font-size: 14px; font-weight: 700; color: #ffffff; letter-spacing: 1px; margin-bottom: 8px; display: block; }
    .qr-sub { font-size: 11px; color: rgba(255,255,255,0.6); font-weight: 500; margin-bottom: 5px; display: block; }
    .qr-verify { font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 600; font-family: 'Tajawal', monospace; direction: ltr; display: block; }
    .qr-present { background: rgba(16,255,144,0.15); border: 1px solid rgba(16,255,144,0.35); border-radius: 8px; padding: 8px 16px; margin-top: 10px; display: inline-block; }
    .qr-present-text { font-size: 12px; color: #10ff90; font-weight: 700; }
    .qr-image-wrapper { background: #ffffff; padding: 12px; border-radius: 16px; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
    .qr-image { display: block; width: 150px; height: 150px; }
    .footer { background: linear-gradient(90deg, #0a1628, #1a2b47); padding: 16px 40px; border-top: 1px solid rgba(255,255,255,0.05); }
    .footer-top { display: flex; justify-content: space-between; align-items: center; flex-direction: row-reverse; margin-bottom: 8px; }
    .footer-system { font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 500; }
    .footer-verified { font-size: 11px; color: rgba(16,255,144,0.75); font-weight: 700; letter-spacing: 1px; }
    .footer-support { text-align: center; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
    .footer-support-label { font-size: 10px; color: rgba(255,255,255,0.4); font-weight: 500; }
    .footer-support-email { font-size: 11px; color: #10ff90; font-weight: 700; font-family: 'Tajawal', monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="logo-section">
        <div class="logo-box"><span>+</span></div>
        <div class="clinic-info">
          <span class="clinic-label">حجز رسمي معتمد</span>
          <div class="clinic-name">${escapeHtml(clinicName)}</div>
          <span class="clinic-sub">${escapeHtml(subTitle)}</span>
        </div>
      </div>
      <div class="confirmed-badge">
        <div class="confirmed-dot"></div>
        <span class="confirmed-text">مؤكد</span>
      </div>
    </div>
    <div class="ref-bar">
      <div>
        <span class="ref-label">رقم الحجز المرجعي</span>
        <span class="ref-sub">احتفظ بهذا الكود بأمان</span>
      </div>
      <div class="code-box">
        <span class="code-text">${escapeHtml(code)}</span>
      </div>
    </div>
    <div class="body">
      <span class="section-title">— بيانات المريض</span>
      <div class="info-row">
        <span class="info-label">الاسم الكامل</span>
        <span class="info-value">${escapeHtml(patientName)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">رقم الهاتف</span>
        <span class="info-value-phone">${escapeHtml(patientPhone)}</span>
      </div>
      <span class="section-title" style="margin-top: 20px;">— الخدمة الطبية</span>
      <div class="info-row service-row">
        <span class="info-label" style="color: rgba(255,255,255,0.7);">نوع الخدمة</span>
        <span class="service-value">${escapeHtml(serviceName)}</span>
      </div>
      <span class="schedule-title" style="margin-top: 22px;">— موعد الحجز</span>
      <div class="schedule-box">
        <div class="schedule-row">
          <span class="schedule-label">التاريخ</span>
          <span class="schedule-date">${escapeHtml(formattedDate)}</span>
        </div>
        <div class="schedule-divider"></div>
        <div class="schedule-row">
          <span class="schedule-label">الوقت</span>
          <span class="schedule-time">${escapeHtml(time)}</span>
        </div>
      </div>
      <div class="qr-section">
        <div class="qr-info">
          <span class="qr-title">امسح للتحقق</span>
          <span class="qr-sub">رمز التحقق الرقمي</span>
          <span class="qr-verify">${escapeHtml(code)} | ${escapeHtml(patientPhone)}</span>
          <div class="qr-present">
            <span class="qr-present-text">يرجى إبراز الكود عند الوصول</span>
          </div>
        </div>
        <div class="qr-image-wrapper">
          <img src="${qrUrl}" class="qr-image" alt="QR" />
        </div>
      </div>
    </div>
    <div class="footer">
      <div class="footer-top">
        <span class="footer-system">${escapeHtml(clinicName)} System 2026</span>
        <span class="footer-verified">موثق رقمياً</span>
      </div>
      <div class="footer-support">
        <span class="footer-support-label">الدعم الفني: </span>
        <span class="footer-support-email">${supportEmail}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

    // تشغيل Puppeteer
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 900, height: 1400, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.evaluateHandle('document.fonts.ready');
    await new Promise(r => setTimeout(r, 500));

    const cardElement = await page.$('.card');
    const buffer = await cardElement.screenshot({ type: 'png', omitBackground: false });
    await browser.close();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(buffer);
  } catch (e) {
    console.error('Error:', e);
    return res.status(500).json({ error: String(e) });
  }
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
