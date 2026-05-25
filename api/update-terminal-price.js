function triggerPayment(method) {
    const modal = document.getElementById("modal-screen");
    const qrBox = document.getElementById("qrcode-container");
    const msg = document.getElementById("modal-status-msg");
    
    // Open the popup modal layout
    modal.classList.replace("hidden", "flex");
    
    if (method === 'qr') {
        document.getElementById("modal-title").innerText = "Static Counter QR";
        
        // This is the permanent address printed on your counter table card!
        const permanentCounterUrl = `https://gopay01.vercel.app/?merchant=${providers[selectedProvider].merchantId}`;
        document.getElementById("modal-desc").innerText = permanentCounterUrl;
        
        // Clear the old QR image box and draw a fresh QR pointing to gopay01
        qrBox.innerHTML = "";
        new QRCode(qrBox, { text: permanentCounterUrl, width: 160, height: 160 });
        
        msg.innerText = "⏳ Syncing price to counter...";
        msg.className = "text-[10px] text-amber-600 font-semibold mb-2";

        // Push the amount data directly across servers to the gopay01 backend engine
        const finalAmt = parseFloat(currentAmount) || 0;
        fetch(`https://gopay01.vercel.app/api/update-terminal-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                merchant: providers[selectedProvider].merchantId, 
                amount: finalAmt, 
                provider: selectedProvider 
            })
        })
        .then(() => { 
            msg.innerText = `● Registered Price: $${finalAmt}`; 
            msg.className = "text-[10px] text-emerald-600 font-semibold mb-2"; 
        })
        .catch((err) => { 
            console.error(err);
            msg.innerText = `❌ Sync Failed`; 
            msg.className = "text-[10px] text-red-600 font-semibold mb-2"; 
        });
    }
}
