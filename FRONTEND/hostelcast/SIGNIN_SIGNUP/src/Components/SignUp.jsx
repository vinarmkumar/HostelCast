// Form controls aur screen state ke liye React useState import hua hai.
import { useState } from "react";
// Pasted/selected artwork ko Vite bundle ke liye left signup panel mein import kiya gaya hai.
import signupArtwork from "../Images/signinsignupbg.png";

const collegeDomainMap = {
  "lpu.in": "Lovely Professional University (LPU)",
  "kiit.ac.in": "Kalinga Institute of Industrial Technology (KIIT)",
  "iitb.ac.in": "IIT Bombay",
  "du.ac.in": "Delhi University (DU)",
  "nift.ac.in": "National Institute of Fashion Technology (NIFT)",
  "aiims.ac.in": "All India Institute of Medical Sciences (AIIMS)",
  "iisc.ac.in": "Indian Institute of Science (IISc)",
  "iisc.edu.in": "Indian Institute of Science (IISc)",
  "bits-pilani.ac.in": "BITS Pilani",
  "thapar.edu.in": "Thapar Institute of Engineering and Technology",
};

const collegeAcronyms = {
  lpu: "Lovely Professional University (LPU)",
  kiit: "Kalinga Institute of Industrial Technology (KIIT)",
  iit: "Indian Institute of Technology",
  du: "Delhi University (DU)",
  nift: "National Institute of Fashion Technology (NIFT)",
  aiims: "All India Institute of Medical Sciences (AIIMS)",
  iisc: "Indian Institute of Science (IISc)",
};

function getCollegeFromEmail(email) {
  const domain = String(email).toLowerCase().split("@")[1]?.trim();
  if (!domain) return "";
  if (collegeDomainMap[domain]) return collegeDomainMap[domain];
  const firstLabel = domain.split(".")[0];
  if (collegeAcronyms[firstLabel]) return collegeAcronyms[firstLabel];
  return firstLabel
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// App.jsx SignUp ko close aur sign-in redirect functions deta hai.
export default function SignUp({ onClose, onSignIn, onAuthenticated }) {
  // signup ab details ya OTP verification screen dikhaye, ye state decide karti hai.
  const [step, setStep] = useState("details");
  // Ye object saare signup inputs ko /api/auth/signup ko JSON mein bhejega.
  const [form, setForm] = useState({ name: "", email: "", college: "", gender: "", password: "" });
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitSignup(event) {
    event.preventDefault();
    setLoading(true); setMessage("");
    try {
      // Form ke name/email/college/password ko authController.js ke signup function tak bheja jaata hai.
      const response = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setStep("otp"); setMessage(data.message);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  function updateEmail(value) {
    const college = getCollegeFromEmail(value);
    setForm((current) => ({ ...current, email: value, college }));
  }

  async function submitOtp(event) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      // form ka email aur OTP screen ki otp value authController.js ke verifyOtp function ko milti hai.
      const response = await fetch("/api/auth/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, otp }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      localStorage.setItem("hostelcast_token", data.token);
      localStorage.setItem("hostelcast_user", JSON.stringify(data.user));
      setMessage(data.message);
      onAuthenticated(data.user);
    } catch (error) { setMessage(error.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="auth-overlay signup-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-card signup-card">
        <button className="auth-close" onClick={onClose} aria-label="Close">×</button>
        <div className="signup-art">
          <img className="signup-art-blur" src={signupArtwork} alt="" />
          <img className="signup-art-full" src={signupArtwork} alt="HostelCast campus community" />
        </div>
        <div className="auth-copy">
          <div className="auth-brand">HostelCast</div>
          <h1>{step === "details" ? "Create your free account" : "Enter verification code"}</h1>
          <p>{step === "details" ? "Join your campus and build your live community." : `Enter the 6-digit OTP sent to ${form.email}.`}</p>
          {step === "details" ? (
            <form onSubmit={submitSignup}>
              <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>
              {/* University email domain check backend mein hota hai, aur OTP isi official address par bheja jayega. */}
              <label>University email address<input type="email" required value={form.email} onChange={(e) => updateEmail(e.target.value)} placeholder="you@college.edu.in" /></label>
              <label>College<input readOnly value={form.college} placeholder="Detected from university email" /></label>
              <label>Gender<select required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="" disabled>Select gender</option><option>Male</option><option>Female</option><option>Gay</option><option>Lesbian</option><option>Transgender</option><option>Other</option></select></label>
              <label>Password<input type="password" minLength="8" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Example: Campus@123" /></label>
              <p className="password-rules">Use 8+ characters with 1 uppercase, 1 lowercase, 1 digit and 1 special character (@#$%^&*). Example: <strong>Campus@123</strong></p>
              {message && <p className="auth-message">{message}</p>}
              <button className="auth-primary" disabled={loading}>{loading ? "Sending OTP..." : "Create free account"}</button>
            </form>
          ) : (
            <form onSubmit={submitOtp}>
              <label>6-digit OTP<input className="otp-input" inputMode="numeric" maxLength="6" required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="000000" /></label>
              {message && <p className="auth-message">{message}</p>}
              <button className="auth-primary" disabled={loading || otp.length !== 6}>{loading ? "Verifying..." : "Verify account"}</button>
            </form>
          )}
          <p className="auth-switch">Already have an account? <button onClick={onSignIn}>Sign in</button></p>
        </div>
      </section>
    </div>
  );
}
