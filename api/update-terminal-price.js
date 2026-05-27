import { useEffect, useState } from "react";

// Use the URL where your POS applet server is hosted (running this backend)
const POS_SERVER_URL = "https://gopaypossystem.vercel.app";

export function CheckoutPortal() {
  const [merchantId, setMerchantId] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Parse query parameters from the browser's URL bar
    const params = new URLSearchParams(window.location.search);
    const urlMerchant = params.get("merchant") || "R-10245";
    const urlAmount = params.get("amount");

    setMerchantId(urlMerchant);

    // 2. If the amount is already present in the URL, use it directly
    if (urlAmount && parseFloat(urlAmount) > 0) {
      setAmount(parseFloat(urlAmount));
      setLoading(false);
      return;
    }

    // 3. Otherwise (Dynamic QR code), poll the server for the cashier's entered amount
    const fetchTerminalPrice = async () => {
      try {
        const res = await fetch(`${POS_SERVER_URL}/api/get-terminal-price?merchant=${urlMerchant}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.session) {
            // Update UI values dynamically based on what the cashier enters!
            setAmount(data.session.amount);
            setInvoiceId(data.session.invoiceId);
          }
        }
      } catch (err) {
        console.error("Error fetching terminal checkout amount:", err);
      } finally {
        setLoading(false);
      }
    };

    // Run immediately on page load
    fetchTerminalPrice();

    // Poll every 1.5 seconds to detect when the cashier enters a new price
    const interval = setInterval(fetchTerminalPrice, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2>Paying Merchant: {merchantId}</h2>
      {loading ? (
        <p>Awaiting checkout amount from terminal...</p>
      ) : (
        <h3>Amount to Pay: ${amount.toFixed(2)}</h3>
      )}
    </div>
  );
}
