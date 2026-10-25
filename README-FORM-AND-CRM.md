# SprintWorks v15 — responsive website + Zoho CRM lead form

## What is fixed
- Restores the 3-step form navigation (the previous v14 form had no wizard/submit handler).
- Responsive contact/form layout for phone, tablet and desktop.
- Browser validation, phone validation, visible pending/success/error states, duplicate-click protection.
- Sends the enquiry to `/api/lead`; the API creates a Zoho CRM Lead using a server-side OAuth refresh token.
- Saves audience, current stage, interest, challenge, NRI return-from country, contact preference, consent, landing URL, referrer and UTM campaign values into the Lead Description.
- Includes honeypot spam check. Do not treat this as a substitute for a proper rate limiter if campaigns scale.

## Important: CRM connection must be configured
The form deliberately does **not** pretend a submission succeeded when Zoho credentials are missing. Until environment variables are set in Vercel, it will show a connection-not-ready message.

### 1. Create OAuth credentials in Zoho API Console
1. Sign in to the Zoho account that owns the CRM.
2. Open https://api-console.zoho.in/ and create a **Server-based Application** (if the console uses a different label, choose the server-side OAuth client type).
3. Use a redirect URL you control for the OAuth grant flow. Do not use a made-up callback URL. If the console requires a callback, a temporary local callback can be used only if you complete the grant flow locally; otherwise configure a callback endpoint you control.
4. Use the Zoho CRM scope `ZohoCRM.modules.leads.CREATE` (add `ZohoCRM.modules.leads.READ` only if you later need read/verification features). Generate an authorization grant and exchange it for tokens following Zoho's OAuth documentation: https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html
5. Keep the **refresh token**, client ID and client secret private. Never paste them into public HTML or commit them to GitHub.

OAuth tokens are region-specific. This package defaults to India data centres (`accounts.zoho.in` and `www.zohoapis.in`). If your CRM account is hosted in a different Zoho data centre, change both URLs to match your account's region.

### 2. Add Vercel environment variables
Vercel → Project → Settings → Environment Variables. Add:
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `ZOHO_ACCOUNTS_URL` = `https://accounts.zoho.in`
- `ZOHO_API_DOMAIN` = `https://www.zohoapis.in`

Apply them to Production and Preview as appropriate, then redeploy. Do not put secret values in `.env.example` or `index.html`.

### 3. Publish
Upload the **contents** of this folder to the root of the existing GitHub repository (keep `index.html`, `api/`, `assets/`, and `vercel.json` at the project root). If your current repository is a React/Next/Vite app, do not overwrite its source tree with this static package; merge the page and serverless function into the existing app instead. Vercel must be configured to deploy this project as a static site with Vercel Functions enabled.

### 4. Test before ads
1. Open the production website on desktop and phone.
2. Fill all three steps and submit a test lead using a test email/phone you control.
3. Verify the lead appears in Zoho CRM → Leads, with the enquiry details in Description.
4. Test invalid email, missing consent, and a failed network/API request; errors should be visible and should not say the lead was received.
5. Try a URL with `?utm_source=meta&utm_medium=paid_social&utm_campaign=sprintworks_test` and check those values in Description.

## Zoho CRM field mapping
- `Last_Name` (mandatory; if only one name is given, it is used here)
- `First_Name`
- `Email`
- `Phone`
- `Lead_Source` = Website
- `Description` = audience, stage, interest, challenge, return-from, contact preference, consent, UTM values, landing page and referrer

If your Zoho layout has additional mandatory fields or validation rules, Zoho may reject the lead. In that case, inspect Vercel Function Logs and add the required fields to `api/lead.js`.

## Privacy
Update the site's privacy notice with your real data controller/contact details and retention practice before paid campaigns. Do not collect sensitive personal information in the free-text challenge field. Only contact people who have consented.
