// Fetch the current payment payload state for a merchant
app.get("/api/get-terminal-price", (req, res) => {
  const merchantId = req.query.merchant;

  if (!merchantId) {
    res.status(400).json({
      success: false,
      error: "Bad Request: 'merchant' query parameter is required."
    });
    return;
  }

  // Retrieve the stored session from our memory map
  const session = terminalsStore.get(String(merchantId));

  if (!session) {
    res.status(404).json({
      success: false,
      message: "No active checkout requests on POS terminal for this merchant identifier."
    });
    return;
  }

  res.status(200).json({
    success: true,
    session
  });
});
