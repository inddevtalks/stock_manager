import { useEffect, useState } from "react";
import { Building2, Check, KeyRound, LogOut, Save, ShieldCheck, Trash2, User, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useFetch } from "../lib/useFetch";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { initials } from "../lib/format";
import { EmptyState, ErrorState } from "../components/ui";

const CURRENCIES = [
  { code: "INR", symbol: "₹" },
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "AED", symbol: "د.إ" },
  { code: "SAR", symbol: "﷼" },
  { code: "AUD", symbol: "A$" },
  { code: "CAD", symbol: "C$" },
  { code: "SGD", symbol: "S$" },
  { code: "JPY", symbol: "¥" },
];

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const { setSettings } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();

  const { data, loading, error, reload } = useFetch(() => api.settings(), []);
  const { data: membersData, reload: reloadMembers } = useFetch(() => api.members(""), []);
  const members = membersData || [];
  const [company, setCompany] = useState({ company_name: "", currency: "INR", currency_symbol: "₹" });
  const [profile, setProfile] = useState({ name: user?.name || "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm: "" });

  const [savingCompany, setSavingCompany] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [memberForm, setMemberForm] = useState({ name: "", email: "", password: "", role: "staff", department: "", phone: "", notes: "" });
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState("");

  useEffect(() => {
    if (data) setCompany(data);
  }, [data]);

  useEffect(() => {
    if (user) setProfile({ name: user.name });
  }, [user]);

  async function saveCompany(event) {
    event.preventDefault();
    if (!company.company_name.trim()) {
      toast.error("Company name required", "Please enter a name for your workspace.");
      return;
    }
    setSavingCompany(true);
    try {
      const updated = await api.updateSettings({
        company_name: company.company_name.trim(),
        currency: company.currency,
        currency_symbol: company.currency_symbol || "₹",
      });
      setSettings(updated);
      setCompany(updated);
      toast.success("Workspace updated", "Your company details have been saved.");
    } catch (err) {
      toast.error("Could not save", err.message);
    } finally {
      setSavingCompany(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (profile.name.trim().length < 2) {
      toast.error("Name too short", "Please enter at least 2 characters.");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await api.updateProfile({ name: profile.name.trim() });
      setUser(updated);
      toast.success("Profile updated", "Your account name has been saved.");
    } catch (err) {
      toast.error("Could not save", err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitMember(event) {
    event.preventDefault();
    setMemberError("");
    if (!memberForm.name.trim()) {
      setMemberError("Member name is required.");
      return;
    }
    setMemberBusy(true);
    try {
      await api.createMember({
        name: memberForm.name.trim(),
        email: memberForm.email.trim(),
        password: memberForm.password,
        role: memberForm.role,
        department: memberForm.department.trim() || null,
        phone: memberForm.phone.trim() || null,
        notes: memberForm.notes.trim() || null,
      });
      toast.success("Member added", `${memberForm.name.trim()} can now take stock out.`);
      setMemberForm({ name: "", email: "", password: "", role: "staff", department: "", phone: "", notes: "" });
      reloadMembers();
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setMemberBusy(false);
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove member "${member.name}"?`)) return;
    try {
      await api.deleteMember(member.id);
      toast.success("Member removed", `${member.name} was removed.`);
      reloadMembers();
    } catch (err) {
      toast.error("Could not remove member", err.message);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordError("");
    if (passwords.new_password.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (passwords.new_password !== passwords.confirm) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword({
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });
      setPasswords({ current_password: "", new_password: "", confirm: "" });
      toast.success("Password changed", "Use your new password next time you sign in.");
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">
            <Building2 size={12} /> Workspace
          </span>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Manage your profile and security.</p>
        </div>
      </div>

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="grid-2 equal">
          <div className="stack">
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Workspace</div>
                  <div className="card-sub">IndDevtalks</div>
                </div>
                <span className="stat-icon">
                  <Building2 size={17} />
                </span>
              </div>
              <div className="card-body">
                <p className="muted small">Company details are managed by the administrator.</p>
              </div>
            </div>


            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Your account</div>
                  <div className="card-sub">Signed in as workspace admin</div>
                </div>
                <span className="stat-icon green">
                  <ShieldCheck size={17} />
                </span>
              </div>
              <div className="card-body">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span className="avatar lg">{initials(user?.name || "A")}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.name}</div>
                    <div className="muted small">{user?.email}</div>
                  </div>
                  <span className="badge badge-brand" style={{ marginLeft: "auto" }}>
                    {user?.role || "admin"}
                  </span>
                </div>
                <form onSubmit={saveProfile} className="stack" style={{ gap: 14 }}>
                  <div className="field">
                    <label htmlFor="profile-name">Display name</label>
                    <div style={{ position: "relative" }}>
                      <User
                        size={15}
                        style={{ position: "absolute", left: 12, top: 13, color: "var(--muted)" }}
                      />
                      <input
                        id="profile-name"
                        className="input"
                        style={{ paddingLeft: 35 }}
                        value={profile.name}
                        onChange={(event) => setProfile({ name: event.target.value })}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="profile-email">Email address</label>
                    <input id="profile-email" className="input" value={user?.email || ""} disabled />
                    <span className="hint">Email is used to sign in and cannot be changed here.</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btn btn-outline" type="submit" disabled={savingProfile}>
                      {savingProfile ? "Saving…" : (
                        <>
                          <Check size={15} /> Save profile
                        </>
                      )}
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={handleLogout}>
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Members</div>
                <div className="card-sub">People who can take stock out of the cupboard</div>
              </div>
              <span className="stat-icon blue">
                <Users size={17} />
              </span>
            </div>
            <div className="card-body stack" style={{ gap: 14 }}>
              <form className="stack" style={{ gap: 10 }} onSubmit={submitMember}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="mem-name">Name *</label>
                    <input
                      id="mem-name"
                      className="input"
                      placeholder="e.g. Priya Sharma"
                      value={memberForm.name}
                      onChange={(event) => setMemberForm((c) => ({ ...c, name: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="mem-dept">Department</label>
                    <input
                      id="mem-dept"
                      className="input"
                      placeholder="e.g. Admin"
                      value={memberForm.department}
                      onChange={(event) => setMemberForm((c) => ({ ...c, department: event.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="mem-email">Email *</label>
                    <input
                      id="mem-email"
                      className="input"
                      type="email"
                      placeholder="name@example.com"
                      value={memberForm.email}
                      onChange={(event) => setMemberForm((c) => ({ ...c, email: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="mem-password">Password *</label>
                    <input
                      id="mem-password"
                      className="input"
                      type="password"
                      placeholder="At least 6 characters"
                      value={memberForm.password}
                      onChange={(event) => setMemberForm((c) => ({ ...c, password: event.target.value }))}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="mem-role">Role</label>
                    <select
                      id="mem-role"
                      className="select"
                      value={memberForm.role}
                      onChange={(event) => setMemberForm((c) => ({ ...c, role: event.target.value }))}
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="mem-phone">Phone</label>
                    <input
                      id="mem-phone"
                      className="input"
                      placeholder="+91 ..."
                      value={memberForm.phone}
                      onChange={(event) => setMemberForm((c) => ({ ...c, phone: event.target.value }))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="mem-notes">Notes</label>
                  <textarea
                    id="mem-notes"
                    className="textarea"
                    placeholder="Optional note..."
                    value={memberForm.notes}
                    onChange={(event) => setMemberForm((c) => ({ ...c, notes: event.target.value }))}
                  />
                </div>
                {memberError && <div className="form-error">{memberError}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={memberBusy}>
                    {memberBusy ? "Adding..." : "Add member"}
                  </button>
                </div>
              </form>

              {members.length === 0 ? (
                <EmptyState
                  icon={<Users size={20} />}
                  title="No members yet"
                  message="Add the first person who can take stock out."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Department</th>
                        <th>Phone</th>
                        <th className="actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id}>
                          <td><strong>{m.name}</strong></td>
                          <td className="muted small">{m.email || "-"}</td>
                          <td>
                            <span className={`badge ${m.role === "admin" ? "badge-brand" : "badge-neutral"} no-dot`}>
                              {m.role || "staff"}
                            </span>
                          </td>
                          <td className="muted small">{m.department || "-"}</td>
                          <td className="muted small">{m.phone || "-"}</td>
                          <td className="actions">
                            <button
                              className="btn-icon danger"
                              title="Remove member"
                              onClick={() => removeMember(m)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="stack">
            <form className="card" onSubmit={savePassword}>
              <div className="card-head">
                <div>
                  <div className="card-title">Change password</div>
                  <div className="card-sub">Keep your admin account secure</div>
                </div>
                <span className="stat-icon amber">
                  <KeyRound size={17} />
                </span>
              </div>
              <div className="card-body stack" style={{ gap: 14 }}>
                <div className="field">
                  <label htmlFor="current-password">Current password</label>
                  <input
                    id="current-password"
                    className="input"
                    type="password"
                    value={passwords.current_password}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, current_password: event.target.value }))
                    }
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    className="input"
                    type="password"
                    value={passwords.new_password}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, new_password: event.target.value }))
                    }
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="confirm-password">Confirm new password</label>
                  <input
                    id="confirm-password"
                    className="input"
                    type="password"
                    value={passwords.confirm}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, confirm: event.target.value }))
                    }
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                {passwordError && <div className="form-error">{passwordError}</div>}
                <div>
                  <button className="btn btn-primary" type="submit" disabled={savingPassword}>
                    {savingPassword ? "Updating…" : "Update password"}
                  </button>
                </div>
              </div>
            </form>

            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">About this workspace</div>
                  <div className="card-sub">Stock Manager v1.0</div>
                </div>
              </div>
              <div className="card-body">
                <ul
                  style={{
                    margin: 0,
                    padding: 0,
                    listStyle: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    fontSize: 12.5,
                    color: "var(--text-2)",
                  }}
                >
                  <li style={{ display: "flex", gap: 10 }}>
                    <Check size={15} color="var(--success)" style={{ flex: "none", marginTop: 2 }} />
                    All stock, issue and return records are stored in a local SQLite database on
                    your server.
                  </li>
                  <li style={{ display: "flex", gap: 10 }}>
                    <Check size={15} color="var(--success)" style={{ flex: "none", marginTop: 2 }} />
                    Issuing an item reduces available stock instantly and adds it to pending until
                    returned.
                  </li>
                  <li style={{ display: "flex", gap: 10 }}>
                    <Check size={15} color="var(--success)" style={{ flex: "none", marginTop: 2 }} />
                    The interface adapts to phones, tablets and desktops — no extra app needed.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}