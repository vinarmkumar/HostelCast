// React ka state feature is component mein form values aur loading/message store karta hai.
import { useEffect, useState } from "react";

// App.jsx is component ko onClose aur onCreate functions pass karta hai.
export default function SignIn({ onClose, onCreate, onAuthenticated }) {
  // form object SignIn input values ko rakhta hai aur controller ko JSON ke roop mein bheja jayega.
  const [form, setForm] = useState({ email: "", password: "" });
  // Backend se mila success ya error message screen par dikhane ke liye hai.
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signin");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [lockSeconds, setLockSeconds] = useState(0);

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setLockSeconds((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockSeconds > 0]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      // Vite proxy /api ko backend auth server par bhejta hai; form object signin controller ko data deta hai.
      const response = await fetch("/api/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json(); // Backend ka JSON message, token aur user data parse hota hai.
      if (!response.ok) {
        if (data.retryAfterSeconds) setLockSeconds(data.retryAfterSeconds);
        throw new Error(data.message); // Controller ka error frontend ko dikhaya jayega.
      }
      localStorage.setItem("hostelcast_token", data.token); // Login token browser mein save hota hai; baad ki protected API ke liye.
      localStorage.setItem("hostelcast_user", JSON.stringify(data.user)); // Basic user information JSON string mein save hoti hai.
      setMessage(data.message);
      onAuthenticated(data.user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMode("reset");
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(event) {
    event.preventDefault();
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$%^&*]).{8,}$/.test(newPassword)) {
      setMessage("Use 8+ characters with uppercase, lowercase, one digit and one special character (@#$%^&*). Example: Campus@123");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, otp, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMode("signin");
      setOtp("");
      setNewPassword("");
      setForm((current) => ({ ...current, password: "" }));
      setMessage(data.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-card">
        <button className="auth-close" onClick={onClose} aria-label="Close">×</button>
        <div className="auth-brand">HostelCast</div>
        <div className="auth-copy">
          <h1>{mode === "signin" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Enter reset code"}</h1>
          <p>{mode === "signin" ? "Reconnect with your college campus." : mode === "forgot" ? "Enter your registered university email." : "Enter the OTP sent to your email and choose a new password."}</p>
          {mode === "signin" && (
            <form onSubmit={handleSubmit}>
              <label>Email address<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@college.edu" /></label>
              <label>Password<div className="password-field"><input type="password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="••••••••" /></div></label>
              <button type="button" className="auth-forgot" onClick={() => { setMode("forgot"); setMessage(""); }}>Forgot password?</button>
              {message && <p className="auth-message">{message}</p>}
              {lockSeconds > 0 && <p className="auth-message">Too many attempts. Try again in {lockSeconds} second{lockSeconds === 1 ? "" : "s"}.</p>}
              <button className="auth-primary" disabled={loading || lockSeconds > 0}>{loading ? "Signing in..." : lockSeconds > 0 ? `Try again in ${lockSeconds}s` : "Sign in"}</button>
            </form>
          )}
          {mode === "forgot" && (
            <form onSubmit={handleForgotPassword}>
              <label>Email address<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@college.edu" /></label>
              {message && <p className="auth-message">{message}</p>}
              <button className="auth-primary" disabled={loading}>{loading ? "Sending OTP..." : "Send reset OTP"}</button>
              <button type="button" className="auth-forgot" onClick={() => { setMode("signin"); setMessage(""); }}>Back to sign in</button>
            </form>
          )}
          {mode === "reset" && (
            <form onSubmit={handlePasswordReset}>
              <label>6-digit OTP<input className="otp-input" inputMode="numeric" maxLength="6" required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
              <label>New password<input type="password" minLength="8" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Example: Campus@123" /></label>
              <p className="password-rules">Use 8+ characters with 1 uppercase, 1 lowercase, 1 digit and 1 special character (@#$%^&*). Example: <strong>Campus@123</strong></p>
              {message && <p className="auth-message">{message}</p>}
              <button className="auth-primary" disabled={loading || otp.length !== 6}>{loading ? "Resetting..." : "Reset password"}</button>
              <button type="button" className="auth-forgot" onClick={() => { setMode("signin"); setMessage(""); }}>Back to sign in</button>
            </form>
          )}
          <p className="auth-switch">New to HostelCast? <button onClick={onCreate}>Create a free account</button></p>
        </div>
      </section>
    </div>
  );
}
