# Google Login — Generating Your Own Keys

The checkout Google login flow ([src/pages/api/auth/google.tsx](src/pages/api/auth/google.tsx)) needs four values in `.env.local`:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
MF_GOOGLE_AUTH_SECRET=
```

If a teammate handed you their own `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, you're sharing their Google Cloud OAuth app — fine for a quick test, but it's their credential, not yours, and they can see every login through it. Generating your own takes a few minutes.

---

## 1. Create a Google OAuth Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or pick an existing personal/sandbox one) — top-left project dropdown → **New Project**.
2. In the left sidebar, go to **APIs & Services** → **OAuth consent screen**.
   - User type: **External**.
   - Fill in the required fields (app name, support email). You don't need to submit for verification — leave the app in **Testing** mode.
   - Under **Test users**, add your own Google account email. In Testing mode, only listed test users can complete the login flow.
3. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - Name it something like `Mellow Fellow Local Dev`.
   - Under **Authorized redirect URIs**, add the URL from the next section.
4. Click **Create**. Google shows you a **Client ID** and **Client secret** — copy both.

### What redirect URI to register

`GOOGLE_REDIRECT_URI` in `.env.local` is currently unused by the code — [google.tsx](src/pages/api/auth/google.tsx#L65-L66) builds the redirect URI itself from the incoming request's host, forced to `http://` in development. So the URI you must register in Google Cloud is whatever you actually load the app at, per [LOCAL_DEV_SETUP.md](LOCAL_DEV_SETUP.md) step 8:

```
http://localhost:3000/api/auth/google
```

If Google rejects the callback with `redirect_uri_mismatch`, it's almost always because the registered URI doesn't exactly match this (including the port and the `http` vs `https`).

---

## 2. Fill In `.env.local`

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your client ID>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your client secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google
```

---

## 3. Generate `MF_GOOGLE_AUTH_SECRET`

This one isn't from Google — it's a shared secret only your own Next.js app and your own local WordPress need to agree on. It authenticates the server-to-server call from [google.tsx](src/pages/api/auth/google.tsx#L190) to the WordPress REST endpoint in [mellow-fellow-google-auth.php](migration/wp/mu-plugins/mellow-fellow-google-auth.php), so it's fine — expected, even — for each developer to use a different value.

Generate a random one:

```bash
openssl rand -hex 32
```

Put it in `.env.local`:

```env
MF_GOOGLE_AUTH_SECRET=<paste the generated value>
```

Then define the **same value** on your local WordPress side, since [mellow-fellow-google-auth.php](migration/wp/mu-plugins/mellow-fellow-google-auth.php#L33) checks for a `MF_GOOGLE_AUTH_SECRET` PHP constant. For local dev, the simplest way is a small mu-plugin in your Local by Flywheel site's `wp-content/mu-plugins/` folder:

```php
<?php
/**
 * Plugin Name: Mellow Fellow Google Auth - Local Secret (DEV ONLY)
 * Description: Defines MF_GOOGLE_AUTH_SECRET for local development.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('MF_GOOGLE_AUTH_SECRET')) {
    define('MF_GOOGLE_AUTH_SECRET', '<same value as .env.local>');
}
```

Don't commit this file — it lives only in your local WordPress install, outside this repo.

---

## Notes

- `.env.local` is gitignored — never commit real Google credentials or the auth secret.
- Because the OAuth consent screen stays in **Testing** mode, only accounts you've added as test users can log in. Add any other Google accounts you want to test with under **Test users**.
- If you ever suspect a shared credential (like one a teammate handed you) has been exposed, the fix is to generate your own via the steps above rather than trying to "clean up" the shared one.
