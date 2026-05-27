import { useState, useEffect } from "react";

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
 */
function parseNdefRecord(rawBytes: number[]) {
  if (!rawBytes || rawBytes.length === 0) return "";
  const langCodeLen = rawBytes[0] & 0x3f;
  const startOffset = 1 + langCodeLen;
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

  // States for dynamic merchant details allowing runtime NFC overwriting
  const [activeMerchantName, setActiveMerchantName] = useState(merchantName || "Morla Cafe");
  const [activeMerchantId, setActiveMerchantId] = useState(merchantId || "738435");
  const defaultMerchantId = activeMerchantId;

  // NFC Core States
  const [nfcStatus, setNfcStatus] = useState<"idle" | "listening" | "reading" | "success" | "error" | "unsupported">("idle");
  const [nfcError, setNfcError] = useState("");

  // NFC Scan Visual Feedback popup
  const [scanToast, setScanToast] = useState<{ active: boolean; merchant: string; amount: string; wallet?: string } | null>(null);

  // Live POS Terminal connection bridge
  useEffect(() => {
    // If the QR has a static invoice locked in the QR URL parameters, use it and bypass polling
    if (merchantAmount && parseFloat(merchantAmount) > 0) {
      setLocalAmount(parseFloat(merchantAmount).toFixed(2));
      return;
    }

    // Connect to the shared POS Cloud Server
    const POS_SERVER = "https://ais-pre-se23lytoniyu6k4jzuctwz-149692226185.europe-west3.run.app";

    const fetchLivePrice = async () => {
      try {
        const response = await fetch(`${POS_SERVER}/api/get-terminal-price?merchant=${activeMerchantId}`);
        const data = await response.json();
        
        if (data.success && data.session && data.session.amount !== undefined) {
          const currentBill = Number(data.session.amount);
          // If unpaid or updated, auto-update the customer's phone view in real-time
          setLocalAmount(currentBill > 0 ? currentBill.toFixed(2) : "");
          
          if (data.session.provider) {
            const proposedWallet = data.session.provider.toLowerCase().trim();
            if (["evc", "edahab", "jeeb", "premier"].includes(proposedWallet)) {
              setSelectedWallet(proposedWallet);
            }
          }
        }
      } catch (error) {
        console.error("Continuous sync tracking blocked or offline:", error);
      }
    };

    fetchLivePrice();
    const syncInterval = setInterval(fetchLivePrice, 1500); // Poll every 1.5s for seamless live register feedback
    return () => clearInterval(syncInterval);
  }, [merchantAmount, activeMerchantId]);

  // Web Audio synth for feedback sound
  function playNfcFeedbackSound() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("AudioContext initialization error:", e);
    }
  }

  // Unified coordinator of NFC tag scans (real & simulated)
  function triggerNfcTapAction(data: { merchant?: string; id?: string; amount?: string; wallet?: string }) {
    playNfcFeedbackSound();

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    if (data.merchant) setActiveMerchantName(data.merchant);
    if (data.id) setActiveMerchantId(data.id);
    if (data.wallet) {
      const w = data.wallet.toLowerCase().trim();
      if (["evc", "edahab", "jeeb", "premier"].includes(w)) {
        setSelectedWallet(w);
      }
    }

    if (data.amount) {
      const parsed = parseFloat(data.amount);
      if (!isNaN(parsed) && parsed > 0) {
        setLocalAmount(parsed.toFixed(2));
      }
    }

    setScanToast({
      active: true,
      merchant: data.merchant || activeMerchantName,
      amount: data.amount || "",
      wallet: data.wallet || selectedWallet
    });
  }

  // Contactless Scan setup
  useEffect(() => {
    if (!("NDEFReader" in window)) {
      setNfcStatus("unsupported");
      return;
    }

    let abortController: AbortController | null = null;

    async function startScan() {
      try {
        setNfcStatus("listening");
        abortController = new AbortController();
        const reader = new (window as any).NDEFReader();
        await reader.scan({ signal: abortController.signal });

        reader.onreading = (event: any) => {
          setNfcStatus("reading");
          const { message } = event;
          let parsed: any = {};

          for (const record of message.records) {
            try {
              if (record.recordType === "url") {
                const decoder = new TextDecoder();
                const urlStr = decoder.decode(record.data);
                const url = new URL(urlStr);
                const params = new URLSearchParams(url.search);
                if (params.get("merchant")) parsed.merchant = params.get("merchant");
                if (params.get("id")) parsed.id = params.get("id");
                if (params.get("amount")) parsed.amount = params.get("amount");
                if (params.get("wallet")) parsed.wallet = params.get("wallet");
              } else if (record.recordType === "text") {
                const decoder = new TextDecoder();
                const text = decoder.decode(record.data);
                try {
                  const j = JSON.parse(text);
                  if (j.merchant) parsed.merchant = j.merchant;
                  if (j.id) parsed.id = j.id;
                  if (j.amount) parsed.amount = j.amount;
                  if (j.wallet) parsed.wallet = j.wallet;
                } catch {
                  text.split(",").forEach((pair: string) => {
                    const [k, v] = pair.split("=");
                    if (k && v) {
                      const trimmedK = k.trim().toLowerCase();
                      const trimmedV = v.trim();
                      if (trimmedK === "merchant" || trimmedK === "merchantname") parsed.merchant = trimmedV;
                      if (trimmedK === "id" || trimmedK === "merchantid") parsed.id = trimmedV;
                      if (trimmedK === "amount") parsed.amount = trimmedV;
                      if (trimmedK === "wallet") parsed.wallet = trimmedV;
                    }
                  });
                }
              }
            } catch (err) {
              console.error("Error decoding NFC data:", err);
            }
          }

          if (parsed.merchant || parsed.amount || parsed.id) {
            setNfcStatus("success");
            triggerNfcTapAction(parsed);
            setTimeout(() => setNfcStatus("listening"), 3000);
          } else {
            setNfcStatus("error");
            setNfcError("Tapped invalid tag format.");
            setTimeout(() => setNfcStatus("listening"), 4000);
          }
        };

        reader.onreadingerror = () => {
          setNfcStatus("error");
          setNfcError("Contactless signal connection lost. Place it closer.");
          setTimeout(() => setNfcStatus("listening"), 3000);
        };
      } catch (err: any) {
        setNfcStatus("unsupported");
      }
    }

    startScan();

    return () => {
      if (abortController) abortController.abort();
    };
  }, []);

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
        <button 
          onClick={() => {
            const mockTags = [
              { merchant: "Sahal Pharmacy", id: "554319", amount: "15.50", wallet: "evc" },
              { merchant: "Mogadishu Mall", id: "901183", amount: "42.00", wallet: "edahab" },
              { merchant: "Jubba Fuel Station", id: "338421", amount: "8.75", wallet: "premier" },
              { merchant: "Banadir Groceries", id: "128416", amount: "22.30", wallet: "jeeb" }
            ];
            const randomTag = mockTags[Math.floor(Math.random() * mockTags.length)];
            triggerNfcTapAction(randomTag);
          }} 
          title="Simulate Contactless POS Merchant Tag Tap"
          style={{ 
            position: "absolute", 
            top: 16, 
            left: 16, 
            height: 28, 
            display: "flex", 
            alignItems: "center", 
            gap: 6, 
            padding: "0 10px", 
            borderRadius: 14, 
            background: "rgba(255,255,255,0.2)", 
            color: "#fff", 
            border: "none", 
            cursor: "pointer", 
            fontSize: 11, 
            fontWeight: 700 
          }}
        >
          <span className="pulse-dot" style={{ 
            display: "inline-block", 
            width: 6, 
            height: 6, 
            borderRadius: "50%", 
            background: "#fff"
          }}></span>
          📡 SIM TEST TAP
        </button>
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
          <span style={{ fontSize: 48, fontWeight: 700, color: "#022047", verticalAlign: "middle" }}>{localAmount || "0.00"}</span>
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
                 color: "#022047",
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
          PAY ${localAmount || "0.00"}
        </a>
      </div>

      {/* NFC SCAN TOAST FEEDBACK */}
      {scanToast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 110, width: "calc(100% - 32px)", maxWidth: 480, background: "#022047", color: "#fff", borderRadius: 16, padding: "12px 16px", boxShadow: "0 10px 25px rgba(2,32,71,0.25)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: 12, animation: "popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F80ED" strokeWidth="2.5"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><circle cx="12" cy="20" r="1"></circle></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>NFC Card Detected</div>
            <div style={{ fontSize: 11, opacity: 0.82 }}>
              Populated {scanToast.merchant} {scanToast.amount ? `($${scanToast.amount})` : ""}
            </div>
          </div>
          <button onClick={() => setScanToast(null)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.6, fontSize: 16, cursor: "pointer", padding: 4 }}>×</button>
        </div>
      )}

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

/* ─────────────────────────────────────────────
   VISUAL DICTIONARY SCHEMATICS
───────────────────────────────────────────── */
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
  .pop-in { animation: popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
`;
