
const nodemailer = require('nodemailer');

const escapeHtml = (value) =>
  String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      message: 'Method not allowed.'
    });
  }

  const {
    ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET,
    ZOHO_REFRESH_TOKEN,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS
  } = process.env;

  const accountsUrl = (
    process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in'
  ).replace(/\/$/, '');

  const apiDomain = (
    process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in'
  ).replace(/\/$/, '');

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    return res.status(503).json({
      ok: false,
      message: 'The enquiry form is temporarily unavailable. Please try again later or email hello@sprintworks.in.'
    });
  }

  try {
    const d = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : (req.body || {});

    // Honeypot: ignore bots without creating a lead.
    if (d.website) {
      return res.status(200).json({ ok: true });
    }

    const name = String(d.name || '').trim().slice(0, 120);
    const email = String(d.email || '').trim().slice(0, 150);
    const phone = String(d.phone || '').trim().slice(0, 30);
    const persona = String(d.persona || '').trim().slice(0, 120);
    const interest = String(d.interest || '').trim().slice(0, 180);
    const stage = String(d.stage || '').trim().slice(0, 150);
    const challenge = String(d.challenge || '').trim().slice(0, 2000);
    const returningFrom = String(d.returningFrom || '').trim().slice(0, 100);
    const contactPreference = String(d.contactPreference || '').trim().slice(0, 100);

    if (
      !name || !email || !phone || !persona || !interest ||
      d.consent !== 'on'
    ) {
      return res.status(400).json({
        ok: false,
        message: 'Please complete the required fields and consent checkbox.'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        ok: false,
        message: 'Please enter a valid email address.'
      });
    }

    if (!/^\+?[0-9\s()-]{8,20}$/.test(phone)) {
      return res.status(400).json({
        ok: false,
        message: 'Please enter a valid phone number.'
      });
    }

    // Connect to Zoho.
    const tokenResponse = await fetch(
      `${accountsUrl}/oauth/v2/token?refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}&grant_type=refresh_token`,
      { method: 'POST' }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error(
        'Zoho token exchange failed:',
        tokenData.error || tokenResponse.status
      );

      return res.status(502).json({
        ok: false,
        message: 'We could not connect to the lead system. Please try again shortly.'
      });
    }

    const desc = [
      'Website enquiry via SprintWorks',
      `Audience: ${persona}`,
      `Stage: ${stage || 'Not specified'}`,
      `Interested in: ${interest}`,
      `Challenge: ${challenge || 'Not provided'}`,
      `Returning from: ${returningFrom || 'Not specified'}`,
      `Contact preference: ${contactPreference || 'Not specified'}`,
      'Consent to contact: Yes',
      `Landing page: ${d.landing_page || ''}`,
      `Referrer: ${d.referrer || ''}`,
      `UTM source: ${d.utm_source || ''}`,
      `UTM medium: ${d.utm_medium || ''}`,
      `UTM campaign: ${d.utm_campaign || ''}`,
      `UTM content: ${d.utm_content || ''}`,
      `UTM term: ${d.utm_term || ''}`
    ].join('\n').slice(0, 32000);

    const parts = name.split(/\s+/);
    const lastName = parts.length > 1 ? parts.pop() : parts[0];
    const firstName = parts.length > 1 ? parts.join(' ') : '';

    const lead = {
      Last_Name: lastName || name,
      First_Name: firstName,
      Email: email,
      Phone: phone,
      Lead_Source: 'Website',
      Description: desc
    };

    const crmResponse = await fetch(`${apiDomain}/crm/v8/Leads`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: [lead],
        trigger: ['workflow']
      })
    });

    const crmData = await crmResponse.json();
    const item = crmData && crmData.data && crmData.data[0];

    if (!crmResponse.ok || !item || item.status !== 'success') {
      console.error(
        'Zoho CRM create lead failed:',
        JSON.stringify(crmData).slice(0, 1500)
      );

      return res.status(502).json({
        ok: false,
        message: 'Your enquiry could not be saved. Please try again, or email hello@sprintworks.in.'
      });
    }

    // The lead is now saved. Email failure must not invalidate it.
    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      try {
        const port = Number(SMTP_PORT || 465);

        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port,
          secure: port === 465,
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000
        });

        const safeName = escapeHtml(name);
        const safeInterest = escapeHtml(interest);
        const safePersona = escapeHtml(persona);
        const safeStage = escapeHtml(stage);
        const safeChallenge = escapeHtml(challenge);

        const first = escapeHtml(firstName || lastName || name);

        const html = `
          <div style="margin:0;background:#f5f4f0;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#20251f;">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e3dc;">
              <div style="padding:24px 28px;border-bottom:1px solid #e5e3dc;">
                <p style="margin:0;font-size:12px;letter-spacing:2px;font-weight:bold;">SPRINTWORKS</p>
                <p style="margin:8px 0 0;color:#6b7169;font-size:12px;">ENQUIRY CONFIRMATION</p>
              </div>
              <div style="padding:28px;">
                <h1 style="font-size:26px;line-height:1.25;margin:0 0 16px;">Thank you for reaching out.</h1>
                <p style="font-size:15px;line-height:1.7;">Hi ${first},</p>
                <p style="font-size:15px;line-height:1.7;">We've received your enquiry. We're glad you're exploring informed choices about education, skills and future careers.</p>
                <div style="background:#f5f4f0;padding:18px;margin:24px 0;">
                  <p style="margin:0 0 12px;font-size:12px;letter-spacing:1px;font-weight:bold;">YOUR ENQUIRY</p>
                  <p style="margin:8px 0;font-size:14px;"><strong>Enquiring as:</strong> ${safePersona}</p>
                  ${safeStage ? `<p style="margin:8px 0;font-size:14px;"><strong>Current situation:</strong> ${safeStage}</p>` : ''}
                  <p style="margin:8px 0;font-size:14px;"><strong>Interested in:</strong> ${safeInterest}</p>
                  ${safeChallenge ? `<p style="margin:8px 0;font-size:14px;"><strong>Your note:</strong> ${safeChallenge}</p>` : ''}
                </div>
                <h2 style="font-size:17px;margin:24px 0 8px;">What happens next?</h2>
                <p style="font-size:14px;line-height:1.7;">Our team will review your enquiry and follow up using your preferred contact method, where applicable.</p>
                <p style="font-size:13px;line-height:1.7;color:#62675f;">This email confirms receipt of your enquiry only. It does not confirm a booking, enrolment or purchase.</p>
                <p style="font-size:14px;line-height:1.7;">Warm regards,<br><strong>Team SprintWorks</strong></p>
              </div>
              <div style="padding:18px 28px;background:#20251f;color:#ffffff;">
                <p style="margin:0;font-size:12px;">Thoughtful decisions. More confident futures.</p>
                <p style="margin:8px 0 0;font-size:12px;"><a href="https://www.sprintworks.in/" style="color:#ffffff;">www.sprintworks.in</a></p>
              </div>
            </div>
          </div>
        `;

        await transporter.sendMail({
          from: {
            name: 'SprintWorks',
            address: SMTP_USER
          },
          to: email,
          replyTo: SMTP_USER,
          subject: 'We’ve received your SprintWorks enquiry',
          text: [
            `Hi ${firstName || lastName || name},`,
            '',
            'Thank you for reaching out to SprintWorks. We have received your enquiry.',
            '',
            `Enquiring as: ${persona}`,
            stage ? `Current situation: ${stage}` : '',
            `Interested in: ${interest}`,
            '',
            'Our team will review your enquiry and follow up using your preferred contact method, where applicable.',
            '',
            'This email confirms receipt only. It does not confirm a booking, enrolment or purchase.',
            '',
            'Warm regards,',
            'Team SprintWorks',
            'https://www.sprintworks.in/'
          ].filter(Boolean).join('\n')
        });

        console.log('SprintWorks confirmation email sent.');
      } catch (emailError) {
        console.error(
          'Confirmation email failed:',
          emailError && emailError.message
        );
      }
    } else {
      console.error('Confirmation email skipped: SMTP environment variables are missing.');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Lead handler error:', error && error.message);

    return res.status(500).json({
      ok: false,
      message: 'Something went wrong while sending your enquiry. Please try again.'
    });
  }
};
