const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  const { ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  const accountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '');
  const apiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in').replace(/\/$/, '');
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    return res.status(503).json({ ok: false, message: 'The enquiry form is not connected yet. Please try again later or email hello@sprintworks.in.' });
  }
  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    // Honeypot: silently accept bots without creating a CRM record.
    if (d.website) return res.status(200).json({ ok: true });
    const name = String(d.name || '').trim().slice(0, 120);
    const email = String(d.email || '').trim().slice(0, 150);
    const phone = String(d.phone || '').trim().slice(0, 30);
    const persona = String(d.persona || '').trim().slice(0, 120);
    const interest = String(d.interest || '').trim().slice(0, 180);
    if (!name || !email || !phone || !persona || !interest || d.consent !== 'on') return res.status(400).json({ ok: false, message: 'Please complete the required fields and consent checkbox.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: 'Please enter a valid email address.' });
    if (!/^\+?[0-9\s()-]{8,20}$/.test(phone)) return res.status(400).json({ ok: false, message: 'Please enter a valid phone number.' });
    const tokenResponse = await fetch(`${accountsUrl}/oauth/v2/token?refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}&grant_type=refresh_token`, { method: 'POST' });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Zoho token exchange failed:', tokenData.error || tokenResponse.status);
      return res.status(502).json({ ok: false, message: 'We could not connect to the lead system. Please try again shortly.' });
    }
    const desc = [
      'Website enquiry via SprintWorks', `Audience: ${persona}`, `Stage: ${d.stage || 'Not specified'}`,
      `Interested in: ${interest}`, `Challenge: ${d.challenge || 'Not provided'}`,
      `Returning from: ${d.returningFrom || 'Not specified'}`, `Contact preference: ${d.contactPreference || 'Not specified'}`,
      `Consent to contact: Yes`, `Landing page: ${d.landing_page || ''}`, `Referrer: ${d.referrer || ''}`,
      `UTM source: ${d.utm_source || ''}`, `UTM medium: ${d.utm_medium || ''}`, `UTM campaign: ${d.utm_campaign || ''}`,
      `UTM content: ${d.utm_content || ''}`, `UTM term: ${d.utm_term || ''}`
    ].join('\n').slice(0, 32000);
    const parts = name.split(/\s+/); const lastName = parts.length > 1 ? parts.pop() : parts[0]; const firstName = parts.length > 1 ? parts.join(' ') : '';
    const lead = { Last_Name: lastName || name, First_Name: firstName, Email: email, Phone: phone, Lead_Source: 'Website', Description: desc };
    const crmResponse = await fetch(`${apiDomain}/crm/v8/Leads`, { method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [lead], trigger: ['workflow'] }) });
    const crmData = await crmResponse.json();
    const item = crmData && crmData.data && crmData.data[0];
    if (!crmResponse.ok || !item || item.status !== 'success') {
      console.error('Zoho CRM create lead failed:', JSON.stringify(crmData).slice(0, 1500));
      return res.status(502).json({ ok: false, message: 'Your enquiry could not be saved. Please try again, or email hello@sprintworks.in.' });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Lead handler error:', error && error.message);
    return res.status(500).json({ ok: false, message: 'Something went wrong while sending your enquiry. Please try again.' });
  }
};
