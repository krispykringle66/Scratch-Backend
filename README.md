# Scratch Backend

The web server that lets a client scratch a card in their own browser,
with the result rolled server-side (so it can't be inspected or
manipulated from the browser's dev tools).

## How it fits together

1. You (the host) run the **ScratchPlugin** in-game.
2. Click "Generate Client Link" \u2014 the plugin calls this backend, which
   rolls all 9 results immediately and stores them, hidden, against a
   session ID.
3. You send the client the link. They open it in any browser \u2014 no
   Dalamud, no plugin, nothing installed.
4. They scratch the card. Each scratch calls this backend, which reveals
   *that one cell's* result and nothing else.
5. Once all 9 are revealed, the plugin (which has been quietly polling)
   shows you the total so you can settle payout manually.

## Hosting it on Render (free tier, no server management)

Render is about as close to "no DevOps experience needed" as this gets \u2014
you point it at your code and it runs it.

**1. Put this code somewhere Render can see it**
Render deploys from a Git repository. Easiest path:
- Create a free GitHub account if you don't have one
- Create a new repository (e.g. `scratch-backend`)
- Upload this whole `ScratchBackend` folder's contents into it (GitHub's
  web UI lets you drag-and-drop files if you don't want to use git
  commands)

**2. Create the Render service**
- Go to https://render.com and sign up (free)
- Dashboard \u2192 **New \u2192 Web Service**
- Connect your GitHub account, select the repository you just made
- Render should auto-detect it's a Node app. Settings:
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Instance Type**: Free is fine to start

**3. Set your Host Key**
- In the service settings, find **Environment** \u2192 **Environment Variables**
- Add a variable: `HOST_KEY` = some long random string you make up
  (this is the shared secret that stops strangers from creating sessions
  on your server \u2014 treat it like a password)
- This exact same value goes into the plugin's "Host Key" field

**4. Deploy**
- Render builds and deploys automatically after you create the service
- Once it's live, you'll get a URL like `https://scratch-backend-xxxx.onrender.com`
- That's your **Backend URL** \u2014 paste it into the plugin's "Backend URL"
  field (no trailing slash needed either way, the plugin trims it)

**5. Test it**
- In the plugin, fill in Backend URL + Host Key, click "Generate Client Link"
- Open the returned link in a browser \u2014 you should see the scratch grid
- Scratch a cell \u2014 it should reveal, and the plugin should show
  "Card complete" within a few seconds of finishing all 9

## One caveat with Render's free tier

Free services "spin down" after a period of no traffic and take ~30-60
seconds to wake back up on the next request. For a live event, either:
- Send a test link to yourself a minute or two before your event starts
  to wake it up, or
- Upgrade to a paid instance ($7/mo tier) if you're running this regularly
  and don't want the cold-start delay

## Local testing (before deploying anywhere)

If you want to test on your own PC before touching Render at all:
```
npm install
set HOST_KEY=test123          (Windows cmd)
$env:HOST_KEY="test123"       (PowerShell)
npm start
```
Then set the plugin's Backend URL to `http://localhost:3000` and Host Key
to `test123`. This only works for testing on the same PC/network though \u2014
a real client on their own internet connection needs the Render (or
similar) deployment to actually reach it.
