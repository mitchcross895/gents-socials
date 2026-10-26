# gentcore

A small social site with **Posts**, **Forum**, and **Profile** tabs. It's plain HTML, CSS, and JavaScript with no build step, so it runs on GitHub Pages as-is.

## Run locally

Open `index.html` in a browser, or serve the folder:

```sh
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. The site will be live at `https://<your-username>.github.io/gents-socials/` within a minute or two.

## Structure

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and navigation |
| `css/styles.css` | All styles. Mobile first: bottom tab bar on phones, sidebar on tablet/desktop, extra side panel on wide screens |
| `js/config.js` | Supabase project URL and publishable key |
| `js/theme-init.js` | Applies the saved light/dark choice before the page draws |
| `js/app.js` | Routing (`#/posts`, `#/forum`, `#/forum/<id>`, `#/profile`), rendering, sign-in, and data access |
| `supabase/migrations/` | Database tables, permissions, and the sign-up trigger |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Database (Supabase)

The site uses [Supabase](https://supabase.com) for data and accounts. Until `js/config.js` is filled in, the page shows a "not connected" message.

### Setup

1. **Create the tables.** The migrations in `supabase/migrations/` create the tables, permissions (row-level security) and a trigger that makes a profile for each new account.
   - With the Supabase GitHub integration and production deploys enabled, it runs when pushed to `main`.
   - Otherwise, open the Supabase dashboard → **SQL Editor**, then paste and run each file once, in filename order.
2. **Connect the site.** In the dashboard, open **Project Settings → API** and copy the **Project URL** and the **publishable / anon** key into `js/config.js`. That key is meant to be public; never put the secret / `service_role` key in this repo.
3. **Set the redirect URL.** Under **Authentication → URL Configuration**, set **Site URL** to `https://<your-username>.github.io/gents-socials/` (and add `http://localhost:8000` under **Redirect URLs** for local testing). Confirmation emails link back here.

### Permissions

Anyone can read posts, threads, and profiles. Signed-in members can create posts, likes, comments, threads, and replies as themselves, delete their own, and edit only their own profile. These rules are enforced by the database, not just the page.

### Changing the schema

Add a new file in `supabase/migrations/` (for example `20261101120000_add_images.sql`) rather than editing the existing one, since migrations that already ran won't run again.

## Security

- **Escaping:** everything users type is HTML-escaped before it's put on the page (`esc()` in `js/app.js`). Keep using `esc()` for any new user-provided text.
- **Content Security Policy** (in `index.html`) only allows scripts from this site and the pinned Supabase library, and only sends data to Supabase. If you add another CDN or service, add it there.
- **Subresource Integrity:** the Supabase library is pinned to an exact version with an `integrity` hash. When upgrading, update the version in both the script URL and the CSP, and regenerate the hash:
  `curl -s <script-url> | openssl dgst -sha384 -binary | openssl base64 -A`
- **Keys:** only the publishable/anon key belongs in `js/config.js`. The secret/`service_role` key bypasses all permissions and must never be committed.
- **Recommended Supabase settings:** keep **Confirm email** on (Authentication → Providers → Email), raise the minimum password length to 8+, and review **Advisors → Security** after each migration.

