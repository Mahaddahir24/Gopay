// Global memory store to keep track of the changing prices
let terminalDatabase = {
  "738435": { amount: 0, provider: "evc" },
  "146136": { amount: 0, provider: "edahab" }
};

export default function handler(req, res) {
  // Allow the morla-pos website to send data here safely
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. If Morla-POS is SENDING a new price (POST)
  if (req.method === 'POST') {
    const { merchant, amount, provider } = req.body;
    if (!merchant) {
      return res.status(400).json({ error: "Missing merchant number" });
    }
    
    terminalDatabase[merchant] = {
      amount: parseFloat(amount) || 0,
      provider: provider || "evc"
    };
    
    return res.status(200).json({ success: true, saved: terminalDatabase[merchant] });
  }

  // 2. If a Customer phone is READING the price (GET)
  if (req.method === 'GET') {
    const { merchant } = req.query;
    if (!merchant || !terminalDatabase[merchant]) {
      return res.status(200).json({ amount: 0, provider: "evc" });
    }
    
    return res.status(200).json(terminalDatabase[merchant]);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
