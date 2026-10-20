document.addEventListener("DOMContentLoaded", async () => {
  const tokenInput = document.getElementById("token");
  const portInput = document.getElementById("port");
  const saveBtn = document.getElementById("saveBtn");
  const statusBox = document.getElementById("statusBox");
  const statusText = document.getElementById("statusText");

  const bridge = new window.DynamicIslandBridgeClient();
  await bridge.loadToken();

  if (bridge.token) {
    tokenInput.value = bridge.token;
  }

  // Check initial connection status
  await updateStatus();

  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    const port = parseInt(portInput.value.trim(), 10) || 14425;

    if (!token) {
      showStatus("Please enter your session token", false);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Connecting...";

    await bridge.setToken(token, port);
    await updateStatus();

    saveBtn.disabled = false;
    saveBtn.textContent = "Save & Test Connection";
  });

  async function updateStatus() {
    statusBox.style.display = "flex";
    statusText.textContent = "Checking connection to 127.0.0.1...";

    const ok = await bridge.checkHealth();
    if (ok) {
      showStatus("Connected to Dynamic Island (127.0.0.1)", true);
    } else {
      showStatus("Bridge offline or token invalid", false);
    }
  }

  function showStatus(message, isSuccess) {
    statusBox.style.display = "flex";
    statusText.textContent = message;
    statusBox.className = `status-bar ${isSuccess ? "status-connected" : "status-disconnected"}`;
  }
});

