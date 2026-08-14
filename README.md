# Tailstream — One-Tap Non-Custodial Buy

A tiny service that turns each alert into a **tap-to-buy** button. The user approves the swap **in their own wallet** — you never hold keys or funds, so it **cannot be stolen** by you, a bug, or a hacker. Safe by construction. *Not financial advice.*

**What the user does:** taps "Buy 0.5 SOL" on an alert → a ready-built swap opens → they approve in their wallet → done. No pasting addresses, no setup.

---

## How it works (the flow)

1. Your Tailstream alert includes a **Buy** button linking to a "Blink" (`dial.to`).
2. Tapping it opens a page (outside Telegram's webview — this is what dodges the Phantom bug that broke you before) showing amount buttons.
3. The user picks a size → their wallet pops up with the exact swap → they approve.
4. `api/buy.js` is the endpoint that builds that swap using **Jupiter**. It only *builds* the transaction; the **user's wallet signs and sends it.**

The token bought is always the **exact mint from the alert** (passed in the URL), so there's no look-alike-token risk, and the user sees the token in their wallet before approving.

---

## Deploy (≈15 min, Vercel)

1. Put these files in a folder (`api/buy.js`, `package.json`).
2. `npm install` (pulls `@solana/actions`), then `npm i -g vercel` → `vercel` (or connect the folder to a Vercel project in their dashboard).
3. Vercel serves the function at `https://YOUR_DOMAIN/api/buy`.
4. Add a square logo at `https://YOUR_DOMAIN/tailstream-icon.png` and set that URL in `buy.js` (the `icon` field).
5. **(Optional, for revenue)** set env vars in Vercel:
   - `PLATFORM_FEE_BPS` = `50` (0.5% per trade)
   - `FEE_ACCOUNT` = a token account **you own** whose mint is **wSOL or the bought token** (no Jupiter Referral Program needed anymore; the fee account's mint must match the swap's input or output).
   Leave both unset to run fee-free at launch.

Any Node host works (Cloudflare Workers, a small VPS, Railway) — Vercel is just the fastest.

---

## Wire it into your Tailstream alert

Build the button URL for each alert (you already have the token mint + symbol):

```
https://dial.to/?action=solana-action:<URL-ENCODED>( https://YOUR_DOMAIN/api/buy?mint=<MINT>&sym=<SYMBOL> )
```

Example inline-keyboard button in your Telegram send (replace the old "Buy in Phantom" button):

```json
{
  "inline_keyboard": [[
    { "text": "🟢 Buy $POPCAT",
      "url": "https://dial.to/?action=solana-action%3Ahttps%3A%2F%2FYOUR_DOMAIN%2Fapi%2Fbuy%3Fmint%3D7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr%26sym%3DPOPCAT" }
  ]]
}
```

### n8n — exact button expression

In the Telegram **Send Message** node → **Additional Fields → Reply Markup → Inline Keyboard**, add a button and set its **URL** to this expression (assumes your alert item has `mint` and `symbol` fields — rename to match yours):

```
={{ 'https://dial.to/?action=' + encodeURIComponent('solana-action:https://YOUR_DOMAIN/api/buy?mint=' + $json.mint + '&sym=' + $json.symbol) }}
```

That `encodeURIComponent` wraps the whole `solana-action:https://…?mint=…&sym=…` string into dial.to's single `action` param (the confirmed current format). Set the button **text** to something like `🟢 Buy $` + the symbol.

---

## Test it

- Deploy, then open `https://YOUR_DOMAIN/api/buy?mint=<a real mint>&sym=TEST` in a browser — you should get the JSON metadata (title, buttons). That confirms GET works.
- Paste the full `dial.to/?action=...` link into a Blink-enabled surface (a supported wallet browser, or X) and tap a button with a wallet connected — confirm the swap prompt appears and signs.
- Do a first real buy with a tiny amount to confirm end-to-end fills.

---

## Honest limitations (know these before launch)

- **It's "tap → approve," not fully automatic.** That's the safe trade-off — auto-execution needs the delegated-key build (separate, multi-week spec).
- **The user needs a Blink-compatible wallet** (Phantom, Backpack, Solflare, etc.). From Telegram it opens `dial.to` in a browser to sign; not every wallet/flow is perfectly smooth on mobile — test your target wallets.
- **Force-open in the system browser, not Telegram's built-in one.** Telegram's in-app webview injects no wallet provider, so if `dial.to` opens *inside* Telegram, connecting a wallet can fail. Have users open it in Safari/Chrome or their wallet's browser (Telegram's "Open in…" menu). This is the same webview limit that broke the old button — we're routing around it, not into it.
- **CORS/OPTIONS is the #1 reason a Blink won't render** — `@solana/actions` `createActionHeaders()` (already wired in) handles this on every response including the OPTIONS preflight, so don't strip it.
- **Slippage is set to 1.5%** and Jupiter picks the route; very illiquid memecoins may fail to route (the endpoint returns a friendly "no route" message).
- **Free Jupiter tier ≈ 1 req/sec.** Fine to launch; move to their paid tier or Ultra if volume grows.
- **Specs verified as of this build** (Jupiter `lite-api.jup.ag/swap/v1` free/no-key, the Actions GET/POST shapes, headers via `createActionHeaders()`, and the `dial.to` format) — but these APIs move, so still smoke-test after deploy.
- **Add your disclaimers** ("informational only / not financial advice") and, if you turn on the platform fee, disclose it.

---

## What this is / isn't

- ✅ Safe, non-custodial, shippable this week, a real upgrade over "here's an address," earns a per-trade fee, and it tests whether users actually value execution help.
- ❌ Not the hands-free auto-copy — that's the deliberate, tested Turnkey build you do *after* this proves people want it.
