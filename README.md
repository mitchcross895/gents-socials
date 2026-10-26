# Gents Socials

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
| `js/data.js` | Demo users, posts, and forum threads |
| `js/app.js` | Routing (`#/posts`, `#/forum`, `#/forum/<id>`, `#/profile`), rendering, and interactions |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Data

There's no database yet. Content starts from the demo data in `js/data.js`, and anything you post, like, or edit is saved to your browser's `localStorage`, so only you see it on that device. Use **Reset demo data** at the bottom of the Profile tab to start over.

When you add a backend later, the places to change are `loadState()` / `saveState()` and the `actions` / `submits` handlers in `js/app.js`.
