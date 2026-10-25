
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed.');
  }

  const { code, error } = req.query || {};

  if (error) {
    return res.status(400).send('Zoho authorization was denied. You can close this page.');
  }

  if (!code) {
    return res.status(400).send('Missing Zoho authorization code.');
  }

  const {
    ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET
  } = process.env;

  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) {
    return res.status(500).send('Zoho OAuth credentials are not configured.');
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      redirect_uri: 'https://www.sprintworks.in/api/zoho/callback',
      code
    });

    const response = await fetch(
      'https://accounts.zoho.in/oauth/v2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      }
    );

    const data = await response.json();

    if (!response.ok || !data.refresh_token) {
      console.error('Zoho OAuth exchange failed:', data.error || response.status);
      return res.status(502).send(
        'Zoho did not return a refresh token. Check the authorization and try again.'
      );
    }

    console.log('Zoho refresh token obtained successfully.');
    return res.status(200).send(
      'Zoho authorization succeeded. The refresh token was returned to the server but is not saved automatically. Contact your site administrator to store it securely in Vercel.'
    );
  } catch (err) {
    console.error('Zoho callback error:', err.message);
    return res.status(500).send('Unable to complete Zoho authorization.');
  }
};
