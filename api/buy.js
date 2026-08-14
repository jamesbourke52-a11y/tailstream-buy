// Tailstream — one-tap non-custodial buy (Solana Action / Blink endpoint)
// NON-CUSTODIAL: builds a swap; the user signs in THEIR OWN wallet. Zero dependencies.

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUP = "https://lite-api.jup.ag/swap/v1";
const LAMPORTS = 1_000_000_000;

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
  "Access-Control-Expose-Headers": "X-Blockchain-Ids, X-Action-Version",
  "Content-Type": "application/json",
  "X-Blockchain-Ids": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "X-Action-Version": "2.4"
};

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, HEADERS); return res.end(); }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const mint = url.searchParams.get("mint");
  const symbol = url.searchParams.get("sym") || "token";

  if (req.method === "GET") {
    if (!mint) return json(res, 400, { message: "Missing token mint" });
    const base = `${url.origin}${url.pathname}?mint=${mint}&sym=${encodeURIComponent(symbol)}`;
    return json(res, 200, {
      type: "action",
      icon: "https://raw.githubusercontent.com/jamesbourke52-a11y/tailstream-buy/main/tailstream-icon.png",
      title: `Buy $${symbol}`,
      description: `Copy the trade — buy $${symbol} from your own wallet. You approve every trade; Tailstream never holds your funds. Not financial advice.`,
      label: `Buy $${symbol}`,
      links: { actions: [
        { type: "transaction", label: "0.25 SOL", href: `${base}&amount=0.25` },
        { type: "transaction", label: "0.5 SOL",  href: `${base}&amount=0.5` },
        { type: "transaction", label: "1 SOL",    href: `${base}&amount=1` },
        { type: "transaction", label: "Buy",      href: `${base}&amount={amount}`,
          parameters: [{ name: "amount", label: "SOL amount", type: "number" }] }
      ] }
    });
  }

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

      const qs = new URLSearchParams({ inputMint: SOL_MINT, outputMint: mint, amount: String(lamports), slippageBps: "150" });
      if (feeBps) qs.set("platformFeeBps", feeBps);
      const quote = await (await fetch(`${JUP}/quote?${qs.toString()}`)).json();
      if (!quote || quote.error) return json(res, 502, { message: "No route for this token right now" });

      const swapReq = { quoteResponse: quote, userPublicKey: account, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" };
      if (feeBps && feeAccount) swapReq.feeAccount = feeAccount;
      const swap = await (await fetch(`${JUP}/swap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(swapReq) })).json();
      if (!swap || !swap.swapTransaction) return json(res, 502, { message: "Could not build the swap" });

      return json(res, 200, { type: "transaction", transaction: swap.swapTransaction, message: `Buying ~${amount} SOL of $${symbol}. You approve in your wallet.` });
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
