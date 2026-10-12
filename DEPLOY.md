# Hosting gabrielprice.com

The site runs on Cloudflare as a Worker with static assets: the built page and photos are served from Cloudflare's network, and a small script, `worker/index.js`, answers `/admin` on the same domain. GitHub Actions builds and deploys every push to `main`, and every pull request gets its own preview link. The Cloudflare free plan covers all of it.

## How the editor works on the live site

- **The door.** Three quick clicks in the top-left corner of the page open the editor. Visitors' copy of the page has no editing code, only the small part that applies saved edits.
- **The lock.** Cloudflare Access guards `/admin`. The first time, it asks for your email and sends you a one-time code. After that you stay signed in for the session length you set (24 hours by default). The Worker checks the Access login again on every request, so the editor stays locked even on preview links, where Access doesn't sit in front.
- **Edits** (retyping, styling, moving, hiding) save to `site-edits/edits.json` on the branch `site-edits`. The Worker keeps one pull request open for them, called "Site edits from the editor", and its preview link shows them. Press **Publish** in the editor panel and the Worker merges it; Cloudflare rebuilds and the edits are live in about a minute. Merging the pull request on GitHub does the same. Close it without merging and the edits are thrown away; your next edit starts a fresh pull request from what is live.
- **Notes** become GitHub issues labelled `site-note`. Each issue records the section, scroll position, screen point, camera, the part you clicked, and a snapshot of the 3D view. The snapshot is stored on the branch `site-notes`, which is never merged. Claude works through open notes and answers each one with a pull request that closes the issue, plus a one-line comment. The editor shows that comment as Claude's reply and marks the note done.

## One-time setup

You need four things: Cloudflare in charge of the domain, a deploy key for GitHub Actions, a login gate for `/admin`, and a GitHub token for the Worker. Visitor analytics (section 6) adds one storage bucket.

### 1. Move gabrielprice.com to Cloudflare

1. Create a free account at dash.cloudflare.com, choose **Add a domain**, enter `gabrielprice.com` and pick the **Free** plan.
2. Cloudflare copies your current DNS records. Check that the Zoho mail records came across: the `MX` records (mx.zoho.com, mx2…, mx3…), the SPF `TXT` record (`v=spf1 include:zoho.com ~all`), the DKIM `TXT` record (a name like `zmail._domainkey`) and any DMARC record. If one is missing, copy it from Zoho's domain setup page. Without them, mail to your address stops.
3. Delete any `A`, `AAAA` or `CNAME` records for `gabrielprice.com` itself and for `www`. The Worker takes over those two names, and the deploy fails while other records hold them.
4. At the registrar where you bought the domain, replace its nameservers with the two that Cloudflare shows. The switch can take from a few minutes to a day. The domain shows **Active** in Cloudflare when it's done.

### 2. Let GitHub Actions deploy

If you have already connected the repo to Cloudflare's **Workers Builds** (Workers & Pages → gabrielprice-com → Settings → Build), Cloudflare deploys `main` and posts a preview on every pull request by itself. In that case, skip this section and leave the GitHub secrets unset: GitHub Actions then only builds and tests, and you avoid two deploys of the same commit. `wrangler.jsonc` runs the build itself, so Workers Builds needs no build command. Its deploy command stays `npx wrangler deploy`.


1. In Cloudflare, go to **My Profile → API Tokens → Create Token** and pick the template **Edit Cloudflare Workers**. Under Account Resources, select your account. Under Zone Resources, select `gabrielprice.com`. Also add the permission **Zone → DNS → Edit**, so the first deploy can attach the domain. Create the token and copy it.
2. Copy your **Account ID**. It's on the right side of the account's Workers & Pages overview page.
3. In the GitHub repo, go to **Settings → Secrets and variables → Actions** and add two repository secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Go to **Actions → Deploy → Run workflow** on `main`. Until these secrets exist, the workflow only builds and tests. The first deploy creates the Worker `gabrielprice-com` and puts it on gabrielprice.com and www.

### Pull-request previews

Workers Builds uses `npx wrangler preview` for non-production branches. The `previews` block in `wrangler.jsonc` supplies the repository variable and binds `FLOW` to the private R2 bucket `gabrielprice-flow-preview`. Create that bucket before the first preview build. Preview visits stay separate from the live site's `gabrielprice-flow` bucket. Static assets and the compatibility date remain at the top level of the configuration.

Set the four editor secrets listed below in **Settings → Runtime variables and secrets → Previews Base** as well as Production. New previews receive those Base secrets; secrets never belong in `wrangler.jsonc`.

If Workers Builds reports a missing `previews` block, bring the updated configuration onto the PR branch and retry its build. A retry of an old commit still reads that commit's old configuration.

### 3. Put a lock on /admin (Cloudflare Access)

1. In the Cloudflare dashboard, open **Zero Trust**. The first time, it asks you for a team name, which becomes `<team>.cloudflareaccess.com`, and to pick a plan. The Free plan covers up to 50 users. It may ask for a card even though nothing is charged.
2. Go to **Access → Applications → Add an application → Self-hosted**. Set the domain to `gabrielprice.com` and the path to `admin`. Add a policy with Action **Allow** and Include **Emails** set to your email address. The one-time-PIN login (a code sent to your email) is on by default. You can add GitHub login under **Settings → Authentication** if you prefer it.
3. Save. Then open the application and copy its **Application Audience (AUD) Tag**.

### 4. Give the Worker its settings

1. Create a GitHub token for the Worker. On github.com, go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **Only select repositories**, then pick `TOOPRICEYY/GabrielPrice.com`.
   - Permissions: **Contents**, **Issues** and **Pull requests**, each set to Read and write.
   - Pick an expiry and set yourself a reminder to renew it. When it expires, the editor shows "Not saved".
2. In Cloudflare, go to **Workers & Pages → gabrielprice-com → Settings → Variables and Secrets** and add four values, each with type **Secret**:

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | the fine-grained token from step 1 |
| `ALLOWED_EMAILS` | your email; separate several with commas |
| `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| `ACCESS_AUD` | the AUD tag from section 3 |

### 5. Try it

Open gabrielprice.com and click the top-left corner three times, quickly. Access asks for your email, then you land back on the page with the editor open. Retype a heading: within a couple of seconds "Saved, not published" shows, and a pull request appears in the repo. Press Publish, and the change is on the live site about a minute later. Pin a note: an issue labelled `site-note` appears.

### 6. Turn on visitor analytics (R2 bucket)

The site records how visitors move through it: how far they scroll, the time they spend on each section, and whether they drive the couch or the scooter. The page sends one small batch to `/api/flow` every 30 seconds and when the visitor leaves. The Worker stores the batches in a Cloudflare R2 bucket. Nothing goes to GitHub, because the repo is public. `flow/README.md` explains what is recorded and why it doesn't slow the page down.

**Do steps 1 and 2 before the analytics pull request merges.** `wrangler.jsonc` binds the bucket `gabrielprice-flow`, and a deploy fails while that bucket doesn't exist. If a deploy has already failed, the previous version stays live: create the bucket, then re-run the deploy (Actions → Deploy → Run workflow, or **Retry build** in Workers Builds).

1. In the Cloudflare dashboard, open **R2 Object Storage**. The first time, Cloudflare asks you to turn R2 on and add a payment card. The free tier (10 GB stored, 1 million writes a month) is far more than this site needs, so nothing is charged at normal traffic.
2. Choose **Create bucket**, name it exactly `gabrielprice-flow`, leave the location on Automatic, and create it.
3. Nothing to set up for old visits: the Worker's daily cron (`triggers` in `wrangler.jsonc`, `prune()` in `worker/flow.js`) deletes each day's visits once they are 90 days old, which is what the privacy page promises. A lifecycle rule on the bucket would do the same, so it isn't needed.
4. After the next deploy, open **gabrielprice.com/admin/flow**. Access asks you to sign in, the same way as for the editor. The page shows the share of visits that reached each section, the average time on each section, and a list of visits. Each visit has a **Replay** link that plays it back in the live 3D scene. Opening `/admin/flow` also marks that browser so your own visits aren't recorded. Open it once on each device you browse the site from.

Visitors with Global Privacy Control or Do Not Track turned on are never recorded. The page sets no cookies. The Worker stores a visitor's IP address, network provider (ISP) and approximate location (country, region and city, from Cloudflare), the site they came from, and their device: type, model, OS and browser, window and screen size, pixel ratio, CPU core count, memory, graphics chip, connection type and speed, time zone, languages, dark mode and reduced-motion settings, plus the page's frame rate, freezes, crashes and load time. `flow/README.md` lists every field. A visitor's device may also keep one returning-visitor id (localStorage `gp.vid`, 13 months); in the EU, EEA, UK and Switzerland the page asks first. The privacy notice at `/privacy` (`flow/privacy.html`) says all of this and has an opt-out button; update it when a field is added.

## Day to day

- `npm ci`, then `npm run build` writes `dist/` and the editor bundle, and `npm test` checks the build and the Worker against a fake GitHub and a fake Access.
- `npm run dev` serves the site locally with wrangler. To use the editor locally without Access, create a `.dev.vars` file containing `DEV_NO_AUTH=1` plus a `GITHUB_TOKEN`. The bypass only works on localhost.
- Analytics: `/admin/flow` reads straight from the bucket, so nothing needs maintaining. Locally, `npm run dev` uses a local, empty stand-in bucket.
- Rotating the GitHub token or adding an editor only means changing a Worker secret. No deploy is needed.
