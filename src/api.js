const API = {
  async login(email, password) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error("Invalid credentials");
    return res.json();
  },
  async wallet(token) {
    const res = await fetch("/api/wallet", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Unauthorized");
    return res.json();
  },
  async transactions(token) {
    const res = await fetch("/api/transactions", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Unauthorized");
    return res.json();
  },
  async withdraw(token, payload) {
    const res = await fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload || {})
    });
    return res.json();
  }
};

export default API;
