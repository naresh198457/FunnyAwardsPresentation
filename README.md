# Funny Awards Presenter

A no-code presentation tool for club events: build award categories (photos, names, funny comments), show a **QR-code voting slide**, then a **live results slide**. Guests vote from their phones; no accounts, no server, no coding.

## Using it (no coding needed)

1. Open the published site (see below) on the laptop connected to the projector. Use Chrome or Edge.
2. **Event settings**: set the presentation title, optionally a club/event logo and a date for the opening slide, and the voting instructions.
3. **＋ Add category**: type the category title, click each photo box to upload a picture, and for each person type a short comment (used on the group slides) and, optionally, a fuller description for their own slide.
4. Check the previews on the right.
5. **💾 Save deck** downloads a backup file; **📂 Open deck** restores it (also handy for moving to another computer).
6. **▶ Start presentation**. Controls: `→`/`Space`/`PageDown` next, `←` back, `C` close/reopen voting, `Esc`/Exit to leave. Move the mouse to show the buttons.
   - Opens on a **title slide**: presentation title, logo and date, nothing else.
   - From there on, your logo (if you added one) stays in the top-right corner of every slide.
   - For each category: a slide with just the **award name**, then every nominee gets their own **full slide** (big photo + full description), then a **voting slide** with everyone together and the QR code, then a **live results slide**. This repeats for each category.
   - **Videos (optional):** in a category's settings, list video file names (one per line) under "Videos to play before this category". Put the video files in the same folder as `index.html` (use `.mp4` so it plays everywhere). They play full-screen, in order, just before that category's name slide; press Next to continue.
   - On the results slide, press **Close voting** to reveal the winner with a gold 🏆.

**Before the event:** open the voting link (Event settings → Voting link) on your own phone and vote to test it. Then **Reset votes**.
**During the event:** keep the presenter tab open (votes are kept even if you refresh).

## Publish on GitHub Pages (one-time)

1. Create a GitHub account and click **New repository** (name e.g. `funny-awards`, Public).
2. Click **uploading an existing file**, drag in **all files from this folder** (`index.html`, `vote.html`, `app.js`, `style.css`, `README.md`) and **Commit**.
3. Go to **Settings → Pages**, under *Branch* choose `main` and `/ (root)`, **Save**.
4. After ~1 minute your site is at `https://<your-username>.github.io/funny-awards/`. Open that link to use the app.

Your decks are stored in the browser you use (and in the downloadable file), not on GitHub, so photos of guests never get published.

## How live voting works

Votes travel over ordinary HTTPS through the free public relay ntfy.sh, so they work on mobile data and any Wi-Fi, with nothing to set up. The presenter's browser collects and counts them, so keep the presenter tab open and online. One vote per phone per category; guests can change their vote until voting is closed. The relay allows a few hundred messages a day per device, far more than a club event needs.

## Files

- `index.html`, `app.js`, `style.css`: editor, presenter and vote counter
- `vote.html`: the page guests see on their phones
