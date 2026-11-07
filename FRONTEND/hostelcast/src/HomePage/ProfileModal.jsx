export default function ProfileModal({ user, onClose }) {
  if (!user) return null;
  return <div className="profile-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="profile-modal" role="dialog" aria-modal="true">
      <button className="profile-close" onClick={onClose} aria-label="Close profile">×</button>
      <div className="profile-avatar">{String(user.name || "User").charAt(0).toUpperCase()}</div>
      <h2>{user.name || "HostelCast User"}</h2><p>{user.email}</p>
      <div className="profile-details">
        <div><span>College</span><strong>{user.college || "Not added"}</strong></div>
        <div><span>Gender</span><strong>{user.gender || "Not added"}</strong></div>
      </div>
    </section>
  </div>;
}
