import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   PRODUCTION CONFIGURATION RAILS
───────────────────────────────────────────── */
const PRODUCTION_MERCHANT = {
  uid: "M0910291",
  apiUserId: "1000416", // EVC Plus Short-Code Switch Identifier: *712*1000416*amount#
  apiKey: "API-675418114",
  name: "City Care Clinic",
};

/**
 * buildWaafiPayload(amount, accountNo)
 * Compiles a secure payment gateway request payload.
 */
function buildWaafiPayload(amount: string, accountNo: string) {
  return {
    schemaVersion: "1.0",
    requestId: `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    channelName: "WEB",
    serviceName: "API_PURCHASE",
    serviceParams: {
      merchantUid: PRODUCTION_MERCHANT.uid,
      apiUserId: PRODUCTION_MERCHANT.apiUserId,
      apiKey: PRODUCTION_MERCHANT.apiKey,
      paymentMethod: "mwallet_account",
      payerInfo: { accountNo: accountNo.replace(/\s+/g, "") },
      transactionInfo: {
        referenceId: `TXN-${Date.now()}`,
        invoiceId: `INV-${Date.now()}`,
        amount: parseFloat(amount).toFixed(2),
        currency: "USD",
        description: "Somali Proximity Tap-to-Pay Engine",
      },
    },
  };
}

/**
 * parseNdefRecord(rawBytes)
 * Safely strips the 3-byte NDEF language preamble.
 * Modified to bypass web-only TextDecoder dependency.
 */
function parseNdefRecord(rawBytes: number[]) {
  if (!rawBytes || rawBytes.length === 0) return "";
  const langCodeLen = rawBytes[0] & 0x3f;
  const startOffset = 1 + langCodeLen;

  // Safe cross-platform conversion method compatible with React Native Hermes/JSC
  return String.fromCharCode.apply(null, rawBytes.slice(startOffset));
}

function buildUssdUri(amount: string) {
  const sanitizedAmount = parseFloat(amount || "0").toFixed(2);
  return `tel:*712*${PRODUCTION_MERCHANT.apiUserId}*${sanitizedAmount}%23`;
}

function loadQRLib() {
  return new Promise<void>((resolve, reject) => {
    if ((window as any).QRCode) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("CDN tracking pipeline offline"));
    document.head.appendChild(s);
  });
}

const MOCK_HISTORY = [
  {
    id: "TXN-001",
    amount: "$12.00",
    wallet: "EVC +252611234",
    status: "SETTLED",
    time: "10:42 AM",
  },
  {
    id: "TXN-002",
    amount: "$8.50",
    wallet: "Zaad +252631001",
    status: "PENDING_PIN",
    time: "10:28 AM",
  },
  {
    id: "TXN-003",
    amount: "$45.00",
    wallet: "Sahal +252651009",
    status: "FAILED",
    time: "09:55 AM",
  },
] as const;

type TxnStatus = "SETTLED" | "PENDING_PIN" | "FAILED";
const STATUS_STYLE: Record<TxnStatus, { bg: string; color: string }> = {
  SETTLED: { bg: "#022047", color: "#fff" },
  PENDING_PIN: { bg: "rgba(2,32,71,0.05)", color: "rgba(2,32,71,0.5)" },
  FAILED: { bg: "rgba(2,32,71,0.05)", color: "#022047" },
};

/* ═══════════════════════════════════════════
   ROOT COMPONENT LAYER
═══════════════════════════════════════════ */
export default function TapToPay() {
  const queryParams = new URLSearchParams(window.location.search);
  const urlAmount = queryParams.get("amount");
  const urlMerchant = queryParams.get("merchant");
  const urlId = queryParams.get("id");

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column", maxWidth: 640, margin: "0 auto", boxShadow: "0 0 20px rgba(0,0,0,0.05)" }}>
      <style>{CSS}</style>
      <CustomerMode
        merchantAmount={urlAmount}
        merchantName={urlMerchant}
        merchantId={urlId}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   CUSTOMER WALLET APPLICATION VIEW
═══════════════════════════════════════════ */
function CustomerMode({
  merchantAmount,
  merchantName,
  merchantId,
}: any) {
  const [localAmount, setLocalAmount] = useState(
    merchantAmount && merchantAmount !== "0.00" && merchantAmount !== "0" 
      ? merchantAmount 
      : ""
  );

  const [selectedWallet, setSelectedWallet] = useState("evc");
  const [copiedUssd, setCopiedUssd] = useState(false);
  const [copiedMerchant, setCopiedMerchant] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const activeMerchantName = merchantName || "Morla Cafe";
  const defaultMerchantId = merchantId || "738435";


  function copyText(text: string, isUssd: boolean) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (isUssd) {
        setCopiedUssd(true);
        setTimeout(() => setCopiedUssd(false), 2000);
      } else {
        setCopiedMerchant(true);
        setTimeout(() => setCopiedMerchant(false), 2000);
      }
    }
  }

  function handleNumPad(key: string) {
    if (key === "⌫") {
      setLocalAmount((p: string) => (p.length > 1 ? p.slice(0, -1) : ""));
    } else if (key === ".") {
      if (!localAmount.includes(".")) {
        setLocalAmount((p: string) => (p || "0") + ".");
      }
    } else {
      if (localAmount === "" || localAmount === "0") {
        setLocalAmount(key);
      } else {
        const parts = localAmount.split(".");
        if (parts[1] && parts[1].length >= 2) return;
        if (localAmount.length >= 8) return;
        setLocalAmount((p: string) => p + key);
      }
    }
  }

  let currentUssdCode = "";
  let currentMerchantDisplay = defaultMerchantId;

  if (selectedWallet === "evc") {
    currentUssdCode = `*789*${defaultMerchantId}*${localAmount || "0"}#`;
  } else if (selectedWallet === "edahab") {
    currentMerchantDisplay = "146136";
    currentUssdCode = `*113*146136*${localAmount || "0"}#`;
  } else if (selectedWallet === "jeeb") {
    currentUssdCode = `*818*${defaultMerchantId}*${localAmount || "0"}#`;
  } else if (selectedWallet === "premier") {
    currentUssdCode = `*355*${defaultMerchantId}*${localAmount || "0"}#`;
  }

  const ussdUri = `tel:${currentUssdCode.replace("#", "%23")}`;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff", width: "100%", overflowY: "auto", overflowX: "hidden", borderRadius: "inherit" }}>
      {/* BLUE HEADER */}
      <div style={{ background: "#2F80ED", backgroundImage: "radial-gradient(rgba(255,255,255,0.15) 1.5px, transparent 1.5px)", backgroundSize: "20px 20px", padding: "32px 20px 24px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <button onClick={() => setShowInfo(true)} style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer", fontSize: 16, fontWeight: "bold", fontFamily: "monospace" }}>
          !
        </button>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2F80ED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>{activeMerchantName}</h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#2F80ED" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 12.5l3 3 5-6" strokeWidth="2.5"></path></svg>
        </div>
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 16, padding: "4px 12px", marginTop: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>MERCHANT NO: {currentMerchantDisplay}</span>
        </div>
      </div>

      <div style={{ padding: "20px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#022047", textAlign: "center", marginBottom: 16, letterSpacing: 0.5 }}>PAYMENT METHOD</div>
        
        {/* WALLETS HORIZONTAL */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 20 }}>
          <div onClick={() => setSelectedWallet("evc")} style={{ position: "relative", cursor: "pointer" }}>
             <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: selectedWallet === "evc" ? "2px solid #2F80ED" : "1px solid rgba(2,32,71,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 100 100" width="46" height="46">
                  <g transform="scale(0.88) translate(7, 62)">
                    <text x="0" y="0" fill="#0ea5e9" fontSize="28" fontWeight="800" fontFamily="Arial, sans-serif">EVC</text>
                    <text x="56" y="0" fill="#22c55e" fontSize="30" fontWeight="800" fontFamily="Arial, sans-serif">P</text>
                    <text x="74" y="-8" fill="#22c55e" fontSize="16" fontWeight="800" fontFamily="Arial, sans-serif">LUS</text>
                    <text x="58" y="10" fill="#0ea5e9" fontSize="10" fontWeight="700" fontFamily="Arial, sans-serif">SERVICE</text>
                  </g>
                </svg>
             </div>
             {selectedWallet === "evc" && (
                <div style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
                </div>
             )}
          </div>

          <div onClick={() => setSelectedWallet("edahab")} style={{ position: "relative", cursor: "pointer" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: selectedWallet === "edahab" ? "2px solid #2F80ED" : "1px solid rgba(2,32,71,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg viewBox="0 0 100 100" width="46" height="46">
                  <g transform="scale(0.9) translate(5, 62)">
                    <text x="0" y="0" fill="#16a34a" fontSize="33" fontWeight="800" fontFamily="Arial, sans-serif" letterSpacing="-1">eDahab</text>
                    <path d="M 28 -18 L 32 -6 L 46 -24" stroke="#facc15" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                </svg>
            </div>
            {selectedWallet === "edahab" && (
                <div style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
                </div>
            )}
          </div>

          <div onClick={() => setSelectedWallet("jeeb")} style={{ position: "relative", cursor: "pointer" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: selectedWallet === "jeeb" ? "2px solid #2F80ED" : "1px solid rgba(2,32,71,0.1)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src="https://i.postimg.cc/4NXvffNj/Jeeb.png" width="54" height="54" alt="Jeeb" style={{ objectFit: "contain" }} referrerPolicy="no-referrer" />
            </div>
            {selectedWallet === "jeeb" && (
                <div style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
                </div>
            )}
          </div>

          <div onClick={() => setSelectedWallet("premier")} style={{ position: "relative", cursor: "pointer" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: selectedWallet === "premier" ? "2px solid #2F80ED" : "1px solid rgba(2,32,71,0.1)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img src="https://i.postimg.cc/dVmz7t8s/Premier-bank.png" width="54" height="54" alt="Premier Bank" style={{ objectFit: "contain" }} referrerPolicy="no-referrer" />
            </div>
            {selectedWallet === "premier" && (
                <div style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
                </div>
            )}
          </div>
        </div>

        {/* USSD DISPLAY */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <div style={{ border: "1px solid rgba(2,32,71,0.1)", borderRadius: 8, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
             <span style={{ fontFamily: "monospace", color: "rgba(2,32,71,0.8)", fontSize: 14, letterSpacing: 1 }}>{currentUssdCode}</span>
             <svg onClick={() => copyText(currentUssdCode, true)} style={{ cursor: "pointer", opacity: copiedUssd ? 0.5 : 1 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={copiedUssd ? "rgba(2,32,71,0.1)" : "#2F80ED"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {copiedUssd ? (
                  <>
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </>
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </>
                )}
             </svg>
          </div>
        </div>
        
        {/* MERCHANT NUMBER DISPLAY */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px", marginBottom: 16 }}>
           <span style={{ fontSize: 14, color: "#022047", fontWeight: 700 }}>Merchant Number:</span>
           <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, color: "#022047", fontWeight: 700 }}>{currentMerchantDisplay}</span>
              <svg onClick={() => copyText(currentMerchantDisplay, false)} style={{ cursor: "pointer", opacity: copiedMerchant ? 0.5 : 1 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={copiedMerchant ? "rgba(2,32,71,0.1)" : "#2F80ED"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {copiedMerchant ? (
                   <>
                    <polyline points="20 6 9 17 4 12"></polyline>
                   </>
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </>
                )}
              </svg>
           </div>
        </div>

        <div style={{ height: 1, background: "rgba(2,32,71,0.1)", margin: "0 -16px 16px" }}></div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#022047", textAlign: "center", marginBottom: 12, letterSpacing: 0.5 }}>ENTER AMOUNT (USD)</div>
        
        <div style={{ background: "rgba(2,32,71,0.03)", border: "1px solid rgba(2,32,71,0.1)", borderRadius: 16, padding: "24px", textAlign: "center", marginBottom: 24 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: "rgba(2,32,71,0.7)", marginRight: 8, verticalAlign: "middle" }}>$</span>
          <span style={{ fontSize: 48, fontWeight: 700, color: "#022047", verticalAlign: "middle" }}>{localAmount || "0"}</span>
        </div>

        <div style={{ height: 1, background: "rgba(2,32,71,0.1)", margin: "0 -16px 20px" }}></div>

        {/* KEYPAD */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {["1","2","3","4","5","6","7","8","9",".","0", "⌫"].map(k => (
            <button 
               key={k} 
               onClick={() => handleNumPad(k)}
               style={{ 
                 background: "#fff", 
                 border: "1px solid rgba(2,32,71,0.1)", 
                 borderRadius: 16, 
                 height: 56, 
                 fontSize: 22, 
                 fontWeight: 600, 
                 color: k === "⌫" ? "#022047" : "#022047",
                 display: "flex",
                 alignItems: "center",
                 justifyContent: "center",
                 cursor: "pointer",
                 boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
               }}
            >
               {k === "⌫" ? (
                  <svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 0.5H21C22.1046 0.5 23 1.39543 23 2.5V15.5C23 16.6046 22.1046 17.5 21 17.5H8C7.54536 17.5 7.12646 17.2663 6.87868 16.8879L1.87868 9.88793C1.61118 9.51201 1.61118 9.0396 1.87868 8.66368L6.87868 1.66368C7.12646 1.28535 7.54536 1.0516 8 1.0516V0.5Z" fill="#022047" />
                    <path d="M12 5.5L18 12.5M18 5.5L12 12.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
               ) : k}
            </button>
          ))}
        </div>

        <a 
          href={Number(localAmount) > 0 ? ussdUri : "#"}
          style={{  
            display: "block",
            background: Number(localAmount) > 0 ? "#2F80ED" : "rgba(2,32,71,0.3)",
            color: "#fff", 
            border: "none", 
            borderRadius: 12, 
            padding: "16px 0", 
            fontSize: 18, 
            fontWeight: 700, 
            marginTop: 24, 
            cursor: Number(localAmount) > 0 ? "pointer" : "default",
            textDecoration: "none",
            textAlign: "center"
          }}
        >
          PAY ${localAmount || "0"}
        </a>
      </div>

      {showInfo && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s ease-out" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 500, maxHeight: "100%", borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", animation: "popIn 0.3s ease-out" }}>
            <div style={{ background: "#2F80ED", padding: "24px 20px 20px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", position: "relative" }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>How GOPAY Works</h3>
            <button onClick={() => setShowInfo(false)} style={{ position: "absolute", right: 20, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0, display: "flex" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div style={{ flex: 1, padding: "28px 20px 0", display: "flex", flexDirection: "column", gap: 24, overflowY: "auto" }}>
            <div style={{ textAlign: "center" }}>
              <h2 style={{ margin: "0 0 12px 0", fontSize: 20, fontWeight: 700, color: "#022047" }}>Direct Mobile Payments</h2>
              <p style={{ margin: 0, fontSize: 15, color: "rgba(2,32,71,0.7)", lineHeight: 1.5 }}>
                Tap NFC, enter amount, and pay instantly without typing USSD codes.
              </p>
            </div>

            <div style={{ background: "#eaf2ff", color: "#2F80ED", padding: "14px 16px", borderRadius: 16, textAlign: "center", fontWeight: 600, fontSize: 14 }}>
              No manual USSD typing needed
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "space-between", marginTop: 4 }}>
              <div style={{ flex: 1, background: "rgba(2,32,71,0.03)", borderRadius: 16, padding: "20px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, background: "#fff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid rgba(2,32,71,0.1)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2F80ED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><line x1="8" y1="8" x2="16" y2="16"></line><line x1="16" y1="8" x2="8" y2="16"></line></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#022047", textAlign: "center", lineHeight: 1.2 }}>Tap NFC</span>
              </div>
              <div style={{ flex: 1, background: "rgba(2,32,71,0.03)", borderRadius: 16, padding: "20px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, background: "#fff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid rgba(2,32,71,0.1)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2F80ED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#022047", textAlign: "center", lineHeight: 1.2 }}>Enter<br/>Amount</span>
              </div>
              <div style={{ flex: 1, background: "rgba(2,32,71,0.03)", borderRadius: 16, padding: "20px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, background: "#fff", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", border: "1px solid rgba(2,32,71,0.1)" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#2F80ED" stroke="#2F80ED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9" stroke="#fff" strokeWidth="2.5"></polyline></svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#022047", textAlign: "center", lineHeight: 1.2 }}>Pay</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <h3 style={{ margin: "8px 0 0", fontSize: 18, fontWeight: 700, color: "#022047" }}>How It Works</h3>
              
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>1</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  <strong style={{ fontSize: 15, color: "#022047" }}>Tap NFC Tag</strong>
                  <span style={{ fontSize: 14, color: "rgba(2,32,71,0.7)", lineHeight: 1.5 }}>Tap your phone on the merchant's NFC tag to open payment page.</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>2</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  <strong style={{ fontSize: 15, color: "#022047" }}>Enter Amount</strong>
                  <span style={{ fontSize: 14, color: "rgba(2,32,71,0.7)", lineHeight: 1.5 }}>Use the keypad to enter payment amount (no keyboard needed).</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>3</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  <strong style={{ fontSize: 15, color: "#022047" }}>Click 'PAY'</strong>
                  <span style={{ fontSize: 14, color: "rgba(2,32,71,0.7)", lineHeight: 1.5 }}>Confirm amount and tap pay to generate USSD code automatically.</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "#2F80ED", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16 }}>4</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                  <strong style={{ fontSize: 15, color: "#022047" }}>Enter PIN</strong>
                  <span style={{ fontSize: 14, color: "rgba(2,32,71,0.7)", lineHeight: 1.5 }}>Enter your mobile money PIN to complete the transaction securely.</span>
                </div>
              </div>
            </div>

            <div style={{ height: 24 }}></div>
          </div>
          
          <div style={{ background: "rgba(2,32,71,0.03)", padding: "20px", textAlign: "center", borderTop: "1px solid rgba(2,32,71,0.1)" }}>
            <img src="https://i.postimg.cc/Bb083LzG/1779318795370.png" alt="GOPAY Logo" style={{ height: 40, marginBottom: 8, display: "inline-block" }} />
            <span style={{ display: "block", fontSize: 13, color: "rgba(2,32,71,0.7)", fontWeight: 500 }}>Designed for Somalia's Mobile Money Ecosystem</span>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}



/* ═══════════════════════════════════════════
   VISUAL DICTIONARY SCHEMATICS
═══════════════════════════════════════════ */
const S = {
  shell: {
    minHeight: "100vh",
    background: "rgba(2,32,71,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 0",
  },
  phone: {
    width: 375,
    minHeight: 720,
    maxHeight: "92vh",
    background: "#fff",
    borderRadius: 40,
    overflow: "hidden",
    boxShadow: "0 32px 80px rgba(0,0,0,0.15), 0 0 0 1px rgba(2,32,71,0.2)",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 28px 8px",
  },
  statusTime: { fontSize: 14, fontWeight: 700, color: "#022047" },
  statusIcons: { fontSize: 11, color: "#022047" },
  toggleWrap: { padding: "4px 16px 12px" },
  toggleTrack: {
    position: "relative",
    display: "flex",
    background: "rgba(2,32,71,0.05)",
    borderRadius: 12,
    padding: 3,
  },
  toggleThumb: {
    position: "absolute",
    top: 3,
    width: "calc(50% - 4px)",
    height: "calc(100% - 6px)",
    background: "#022047",
    borderRadius: 9,
    transition: "left 0.2s cubic-bezier(0.4,0,0.2,1)",
  },
  toggleBtn: {
    flex: 1,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px 0",
    fontSize: 13,
  },
  body: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
  },
  amountDisplay: { padding: "20px 24px 8px", textAlign: "center" },
  amountLabel: {
    fontSize: 11,
    color: "rgba(2,32,71,0.4)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountValue: {
    fontSize: 48,
    fontWeight: 700,
    color: "#022047",
    letterSpacing: -2,
    marginTop: 4,
  },
  keypadGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 6,
    padding: "8px 16px 12px",
  },
  key: {
    padding: "16px 0",
    border: "1px solid rgba(2,32,71,0.1)",
    borderRadius: 12,
    fontSize: 20,
    fontWeight: 500,
    cursor: "pointer",
  },
  terminalWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 20px 20px",
    position: "relative",
  },
  terminalCenter: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  tabBar: {
    display: "flex",
    gap: 4,
    background: "rgba(2,32,71,0.05)",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    width: "100%",
  },
  tabBtn: {
    flex: 1,
    border: "none",
    borderRadius: 7,
    padding: "8px 0",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  nfcRing: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    border: "1.5px solid rgba(2,32,71,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  nfcInner: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    border: "1px solid rgba(2,32,71,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 40,
    height: 40,
    border: "2px solid rgba(2,32,71,0.1)",
    borderTop: "2px solid #022047",
    borderRadius: "50%",
    marginBottom: 16,
  },
  iconWrap: { marginBottom: 12 },
  terminalAmount: {
    fontSize: 36,
    fontWeight: 700,
    color: "#022047",
    letterSpacing: -1,
  },
  terminalStatus: { fontSize: 17, fontWeight: 600, color: "#022047" },
  terminalSub: {
    fontSize: 12,
    color: "rgba(2,32,71,0.4)",
    textAlign: "center",
    maxWidth: 240,
  },
  backBtn: {
    position: "absolute",
    top: 12,
    left: 16,
    background: "none",
    border: "none",
    fontSize: 13,
    color: "rgba(2,32,71,0.4)",
    cursor: "pointer",
  },
  devBtn: {
    marginTop: 16,
    background: "rgba(2,32,71,0.05)",
    border: "1px dashed rgba(2,32,71,0.2)",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 11,
    fontWeight: 600,
    color: "#022047",
    cursor: "pointer",
  },
  qrWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  qrFrame: {
    width: 180,
    height: 180,
    borderRadius: 12,
    border: "1.5px solid rgba(2,32,71,0.1)",
    background: "rgba(2,32,71,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qrLoader: { display: "flex", flexDirection: "column", alignItems: "center" },
  qrAmountPill: {
    background: "#022047",
    color: "#fff",
    borderRadius: 20,
    padding: "4px 14px",
    fontSize: 14,
    fontWeight: 700,
  },
  qrInstruction: {
    fontSize: 12,
    color: "rgba(2,32,71,0.6)",
    textAlign: "center",
    maxWidth: 220,
  },
  ussdChip: {
    display: "flex",
    alignItems: "center",
    background: "rgba(2,32,71,0.05)",
    borderRadius: 8,
    padding: "6px 12px",
    border: "1px solid rgba(2,32,71,0.1)",
  },
  ussdChipCode: { fontFamily: "monospace", fontSize: 12, fontWeight: 700 },
  historyWrap: { padding: "12px 16px 20px" },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(2,32,71,0.4)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  txnRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid rgba(2,32,71,0.05)",
  },
  txnWallet: { fontSize: 13, fontWeight: 600 },
  txnMeta: { fontSize: 11, color: "rgba(2,32,71,0.4)" },
  txnAmount: { fontSize: 13, fontWeight: 700 },
  badge: {
    display: "inline-block",
    fontSize: 8,
    fontWeight: 700,
    padding: "2px 5px",
    borderRadius: 4,
  },
  walletCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    borderRadius: 12,
    marginBottom: 6,
  },
  walletName: { fontSize: 13, fontWeight: 700 },
  walletPhone: { fontSize: 11, color: "rgba(2,32,71,0.4)" },
  walletBal: { fontSize: 14, fontWeight: 700 },
  payBtn: {
    background: "#022047",
    border: "none",
    borderRadius: 12,
    padding: "14px 0",
    cursor: "pointer",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
  },
  broadcastWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
  },
  orbitWrap: {
    width: 100,
    height: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  orbitOuter: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    border: "1px dashed rgba(2,32,71,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  orbitMid: {
    width: 70,
    height: 70,
    borderRadius: "50%",
    border: "1.5px solid rgba(2,32,71,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  orbitCore: { width: 40, height: 40, borderRadius: "50%", background: "#022047" },
  broadcastTitle: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 6,
  },
  broadcastSub: {
    fontSize: 12,
    color: "rgba(2,32,71,0.6)",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 240,
  },
  qrScanWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "36px 20px 24px",
    position: "relative",
  },
  scanViewfinder: {
    width: 180,
    height: 180,
    borderRadius: 16,
    border: "2px solid #022047",
    position: "relative",
    overflow: "hidden",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    background: "#022047",
  },
  scannedCard: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  scannedSection: { padding: "4px 8px" },
  scannedLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "rgba(2,32,71,0.4)",
    textTransform: "uppercase",
  },
  scannedValue: { fontSize: 18, fontWeight: 700 },
  scannedDivider: { height: 1, background: "rgba(2,32,71,0.05)" },
  dialBtn: {
    display: "block",
    textAlign: "center",
    background: "#022047",
    color: "#fff",
    textDecoration: "none",
    borderRadius: 12,
    padding: "14px 0",
    fontSize: 13,
    fontWeight: 700,
    margin: "8px 0",
  },
  inAppBtn: {
    background: "rgba(2,32,71,0.05)",
    border: "none",
    borderRadius: 12,
    padding: "12px 0",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  ussdOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "flex-end",
    zIndex: 50,
  },
  ussdCard: {
    width: "100%",
    background: "#fff",
    borderRadius: "20px 20px 0 0",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
  },
  ussdCarrier: {
    fontSize: 9,
    fontWeight: 700,
    color: "rgba(2,32,71,0.4)",
    textAlign: "center",
    marginBottom: 6,
  },
  ussdTitle: {
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 4,
  },
  ussdAmount: {
    fontSize: 13,
    color: "rgba(2,32,71,0.6)",
    textAlign: "center",
    marginBottom: 12,
  },
  pinDots: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    marginBottom: 16,
  },
  pinDot: { width: 12, height: 12, borderRadius: "50%" },
  ussdGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 },
  ussdKey: {
    padding: "12px 0",
    border: "1px solid rgba(2,32,71,0.1)",
    borderRadius: 10,
    fontSize: 18,
    fontWeight: 500,
    background: "#fff",
  },
  receiptWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 24px",
  },
  receiptAmount: { fontSize: 38, fontWeight: 700, letterSpacing: -1 },
  receiptMerchant: { fontSize: 13, color: "rgba(2,32,71,0.6)", marginBottom: 16 },
  receiptCard: {
    width: "100%",
    background: "rgba(2,32,71,0.05)",
    borderRadius: 12,
    padding: "4px 12px",
    marginBottom: 20,
  },
  receiptRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid rgba(2,32,71,0.1)",
  },
  receiptKey: { fontSize: 12, color: "rgba(2,32,71,0.4)" },
  receiptVal: { fontSize: 12, fontWeight: 600, color: "#022047" },
  doneBtn: {
    width: "100%",
    background: "#022047",
    border: "none",
    borderRadius: 12,
    padding: "14px 0",
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
  },
};

/* ═══════════════════════════════════════════
   ANIMATION RULES
═══════════════════════════════════════════ */
const CSS = `
  @keyframes pulseRing {
    0%   { box-shadow: 0 0 0 0 rgba(0,0,0,0.08); }
    70%  { box-shadow: 0 0 0 14px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  }
  .pulse-ring { animation: pulseRing 1.8s ease-out infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes popIn {
    0% { transform: scale(0.9); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes fadeIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes slideUp {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  .pop-in { animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  @keyframes orbitSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .orbit-outer { animation: orbitSpin 8s linear infinite; }
  .orbit-mid   { animation: orbitSpin 5s linear infinite reverse; }
  @keyframes scanMove { 0% { top: 0; } 100% { top: calc(100% - 2px); } }
  .scan-line { animation: scanMove 1.4s ease-in-out infinite alternate; }
  .scan-frame { animation: pulseRing 1.4s ease-in-out infinite; }
`;
