// Tailstream — one-tap non-custodial buy (Solana Action / Blink endpoint)
//
// NON-CUSTODIAL BY CONSTRUCTION: this service only *builds* a swap transaction.
// The user signs & sends it in THEIR OWN wallet. You never see keys or hold funds,
// so there is nothing here for you — or a hacker, or a bug — to steal.
//
// GET  /api/buy?mint=<MINT>&sym=<SYMBOL>          -> Blink UI (amount buttons)
// POST /api/buy?mint=<MINT>&amount=<SOL>          -> { transaction } for the wallet to sign
//
// Deploy on Vercel (file at /api/buy.js is served at https://yourdomain/api/buy).
// Env (optional, for revenue): PLATFORM_FEE_BPS (e.g. "50" = 0.5%),
//   FEE_ACCOUNT = a token account YOU own whose mint is wSOL or the bought token
//   (no Jupiter Referral Program needed anymore; the fee ATA's mint must match input or output).
//
// VERIFY before launch: Jupiter base URL + params, the Solana Actions spec version,
// and the dial.to link format — these move; check current docs.

const { createActionHeaders } = require("@solana/actions");

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag/swap/v1"; // free tier, no key (verified 2026)
const LAMPORTS = 1_000_000_000;

// Let the SDK set CORS + the correct current X-Action-Version + Solana CAIP-2 chain id.
// (The exact X-Action-Version string is not safely hardcodable — do not guess it.)
const HEADERS = Object.assign({ "Content-Type": "application/json" }, createActionHeaders());

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, HEADERS); return res.end(); }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const mint = url.searchParams.get("mint");
  const symbol = url.searchParams.get("sym") || "token";

  // ---- GET: render the Blink (amount buttons) ----
  if (req.method === "GET") {
    if (!mint) return json(res, 400, { message: "Missing token mint" });
    const base = `${url.origin}${url.pathname}?mint=${mint}&sym=${encodeURIComponent(symbol)}`;
    return json(res, 200, {
      type: "action",
      icon: "https://YOUR_DOMAIN/tailstream-icon.png",   // <-- your logo (square png)
      title: `Buy $${symbol}`,
      description: `Copy the trade — buy $${symbol} from your own wallet. You approve every trade; Tailstream never holds your funds. Not financial advice.`,
      label: `Buy $${symbol}`,
      links: {
        actions: [
          { type: "transaction", label: "0.25 SOL", href: `${base}&amount=0.25` },
          { type: "transaction", label: "0.5 SOL",  href: `${base}&amount=0.5` },
          { type: "transaction", label: "1 SOL",    href: `${base}&amount=1` },
          { type: "transaction", label: "Buy",      href: `${base}&amount={amount}`,
            parameters: [{ name: "amount", label: "SOL amount", type: "number" }] }
        ]
      }
    });
  }

  // ---- POST: build the swap tx for the user's wallet ----
  if (req.method === "POST") {
    try {
      const amount = parseFloat(url.searchParams.get("amount"));
      if (!mint || !amount || amount <= 0) return json(res, 400, { message: "Bad token or amount" });

      const body = await readJson(req);
      const account = body && body.account;
      if (!account) return json(res, 400, { message: "Missing account" });

      const lamports = Math.round(amount * LAMPORTS);
      const feeBps = process.env.PLATFORM_FEE_BPS || "";
      const feeAccount = process.env.FEE_ACCOUNT || "";

      // 1) quote SOL -> exact token from the alert
      const qs = new URLSearchParams({
        inputMint: SOL_MINT, outputMint: mint, amount: String(lamports), slippageBps: "150"
      });
      if (feeBps) qs.set("platformFeeBps", feeBps);
      const quote = await (await fetch(`${JUP}/quote?${qs.toString()}`)).json();
      if (!quote || quote.error) return json(res, 502, { message: "No route for this token right now" });

      // 2) build the swap transaction (unsigned) for the user's wallet
      const swapReq = {
        quoteResponse: quote,
        userPublicKey: account,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto"
      };
      if (feeBps && feeAccount) swapReq.feeAccount = feeAccount;
      const swap = await (await fetch(`${JUP}/swap`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(swapReq)
      })).json();
      if (!swap || !swap.swapTransaction) return json(res, 502, { message: "Could not build the swap" });

      return json(res, 200, {
        type: "transaction",
        transaction: swap.swapTransaction, // base64 — wallet signs & sends this
        message: `Buying ~${amount} SOL of $${symbol}. You approve in your wallet.`
      });
    } catch (e) {
      return json(res, 500, { message: "Swap build failed — try again" });
    }
  }

  res.writeHead(405, HEADERS); res.end();
};

function json(res, code, obj) { res.writeHead(code, HEADERS); res.end(JSON.stringify(obj)); }
function readJson(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", c => d += c);
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); } });
  });
}
