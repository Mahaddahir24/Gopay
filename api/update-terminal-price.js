// api/update-terminal-price.js

// Using global memory store for temporary transaction states
global.terminalDb = global.terminalDb || {};

module.exports = async (req, res) => {
    // Enable CORS so your frontend dashboard at gopay01 can talk to it cleanly
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 1. POS Terminal Updates the active balance state (POST Request)
    if (req.method === 'POST') {
        const { merchant, amount, provider } = req.body;
        if (!merchant) {
            return res.status(400).json({ error: 'Missing Merchant parameters' });
        }

        global.terminalDb[merchant] = {
            amount: parseFloat(amount) || 0,
            provider: provider || 'evc',
            time: new Date().toISOString()
        };
        return res.status(200).json({ success: true });
    }

    // 2. Customer Scans Fixed QR -> Instantly Auto-dials via Client Trigger (GET Request)
    if (req.method === 'GET') {
        const { merchant } = req.query;
        if (!merchant) {
            return res.status(400).send('Invalid Terminal Configuration');
        }

        const liveSession = global.terminalDb[merchant];
        
        // Handle case where no price was sent by cashier yet
        if (!liveSession || !liveSession.amount || liveSession.amount <= 0) {
            res.setHeader('Content-Type', 'text/html');
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Morla Cafe</title>
                    <style>
                        body { font-family: -apple-system, sans-serif; text-align: center; padding: 50px 20px; background: #F8FAFC; color: #0F2942; }
                        .card { background: white; max-width: 320px; margin: 0 auto; padding: 30px; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border: 1px solid #E2E8F0; }
                        h2 { color: #EF4444; margin-top: 0; font-size: 20px; }
                        p { color: #64748B; font-size: 14px; line-height: 1.5; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>No Active Order</h2>
                        <p>Please ask the cashier to type the amount and tap "Static QR" first before scanning.</p>
                    </div>
                </body>
                </html>
            `);
        }

        // Generate the respective USSD string
        let dialString = `tel:*789*${merchant}*${liveSession.amount}#`;
        if (liveSession.provider === 'edahab') {
            dialString = `tel:*113*146136*${liveSession.amount}#`;
        } else if (liveSession.provider === 'jeeb') {
            dialString = `tel:*818*${merchant}*${liveSession.amount}#`;
        } else if (liveSession.provider === 'premier') {
            dialString = `tel:*355*${merchant}*${liveSession.amount}#`;
        }

        const finalAmount = liveSession.amount;

        // Clear the entry instantly so it cannot be double-scanned or re-entered on refresh
        global.terminalDb[merchant] = { amount: 0, provider: 'evc' };

        // Return a clean automation page instead of using res.redirect()
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Processing Payment...</title>
                <style>
                    body { font-family: -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #F8FAFC; color: #0F2942; }
                    .card { background: white; max-width: 320px; margin: 0 auto; padding: 35px 25px; border-radius: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border: 1px solid #E2E8F0; }
                    .spinner { width: 40px; height: 40px; border: 4px solid #E2E8F0; border-top: 4px solid #2B83EA; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    h2 { font-size: 18px; margin-bottom: 8px; font-weight: 700; }
                    p { color: #64748B; font-size: 13px; margin-bottom: 20px; }
                    .btn { display: inline-block; background: #2B83EA; color: white; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 6px rgba(43,131,234,0.2); }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="spinner"></div>
                    <h2>Opening Payment Dialer</h2>
                    <p>Sending total amount of <strong>$${finalAmount}</strong> to your phone dialer...</p>
                    <a href="${dialString}" class="btn">Click if dialer doesn't open</a>
                </div>
                <script>
                    // Instantly bounce window location directly into native phone application dialer
                    window.location.href = "${dialString}";
                </script>
            </body>
            </html>
        `);
    }

    return res.status(405).end();
};

