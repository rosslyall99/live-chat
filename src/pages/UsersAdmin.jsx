import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import { invokeAdmin } from "../lib/invokeAdmin";
import "./UsersAdmin.css";

const ROLES = ["agent", "manager", "admin"];
const ROTA_BRANCH_OPTIONS = [
  { value: "", label: "Use site/default" },
  { value: "STE", label: "St Enoch" },
  { value: "DUK", label: "Duke Street" },
  { value: "HIRE", label: "Hire" },
  { value: "OFFICE", label: "Office" },
];
const LOGIN_GROUP_OPTIONS = [
  { value: "", label: "Use operational site" },
  { value: "sten", label: "St Enoch" },
  { value: "duke", label: "Duke Street" },
  { value: "off", label: "Office" },
  { value: "hire", label: "Hire" },
];

function blankProfileDraft() {
  return {
    display_name: "",
    site_id: "",
    role: "agent",
    rota_branch: "",
    login_group: "",
    rota_match_name: "",
  };
}

function profileToDraft(profile) {
  if (!profile) return blankProfileDraft();
  return {
    display_name: profile.display_name || "",
    site_id: profile.site_id || "",
    role: profile.role || "agent",
    rota_branch: profile.rota_branch || "",
    login_group: profile.login_group || "",
    rota_match_name: profile.rota_match_name || "",
  };
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function slugifyName(value) {
  return normalizeText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFirstNameSlug(displayName) {
  const first = String(displayName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0];

  return slugifyName(first || displayName);
}

function getSitePrefix(siteId) {
  const site = normalizeText(siteId);

  if (site === "duke" || site === "duk") return "duke";
  if (site === "sten" || site === "ste" || site === "stenoch") return "stenoch";
  if (site === "hire") return "hire";
  if (site === "office" || site === "off") return "off";

  return slugifyName(site) || "staff";
}

function getUniqueUsername(base, rows) {
  const existing = new Set(
    (rows || []).map((row) => normalizeText(row.username)).filter(Boolean),
  );
  const safeBase = slugifyName(base) || "staff-user";

  if (!existing.has(safeBase)) return safeBase;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${safeBase}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }

  return `${safeBase}-${Date.now()}`;
}

function formatSite(siteId, sites) {
  const site = (sites || []).find((item) => item.id === siteId);
  if (!siteId) return "-";
  return site?.name ? `${site.name} (${site.id})` : siteId;
}

function siteToRotaBranch(siteId) {
  const site = normalizeText(siteId);
  if (site === "duke") return "DUK";
  if (site === "sten") return "STE";
  if (site === "hire") return "HIRE";
  if (site === "office") return "OFFICE";
  return "-";
}

function statusLabel(isActive) {
  return isActive ? "Active" : "Inactive";
}

export default function UsersAdmin() {
  const [rows, setRows] = React.useState([]);
  const [sites, setSites] = React.useState([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [displayName, setDisplayName] = React.useState("");
  const [siteId, setSiteId] = React.useState("");
  const [role, setRole] = React.useState("agent");
  const [pin, setPin] = React.useState("");
  const [newRotaName, setNewRotaName] = React.useState("");
  const [newRotaBranch, setNewRotaBranch] = React.useState("");
  const [newLoginGroup, setNewLoginGroup] = React.useState("");

  const [creating, setCreating] = React.useState(false);
  const [mode, setMode] = React.useState("detail");
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [selectedDraft, setSelectedDraft] = React.useState(blankProfileDraft);

  const [rotaNamesLoading, setRotaNamesLoading] = React.useState(false);
  const [rotaNames, setRotaNames] = React.useState([]);

  const loadSeq = React.useRef(0);

  async function loadAll() {
    const seq = ++loadSeq.current;

    setLoading(true);
    setError("");

    try {
      const sitesRes = await invokeAdmin("admin_list_sites", {});
      const staffRes = await invokeAdmin("admin_list_staff", {});

      if (seq !== loadSeq.current) return;

      if (sitesRes?.error)
        throw new Error(sitesRes.error.message || "admin_list_sites failed");
      if (staffRes?.error)
        throw new Error(staffRes.error.message || "admin_list_staff failed");

      setSites(sitesRes?.data?.sites || []);
      setRows(staffRes?.data?.staff || []);
    } catch (e) {
      console.error(e);
      if (seq !== loadSeq.current) return;

      setError(String(e.message || e));
      setSites([]);
      setRows([]);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  React.useEffect(() => {
    loadAll();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        loadAll();
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRotaNames() {
    setRotaNamesLoading(true);
    setError("");

    try {
      const res = await invokeAdmin("admin_list_rota_staff_names", {});
      if (res?.error)
        throw new Error(
          res.error.message || "admin_list_rota_staff_names failed",
        );

      setRotaNames(res?.data?.names || []);
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setRotaNames([]);
    } finally {
      setRotaNamesLoading(false);
    }
  }

  const generatedUsername = React.useMemo(() => {
    const namePart = getFirstNameSlug(displayName) || "staff";
    const prefix = getSitePrefix(siteId);
    return getUniqueUsername(`${prefix}-${namePart}`, rows);
  }, [displayName, rows, siteId]);

  const selectedUser = React.useMemo(
    () => rows.find((row) => row.user_id === selectedUserId) || null,
    [rows, selectedUserId],
  );

  const selectedRotaOptions = React.useMemo(() => {
    const names = new Set();
    if (selectedUser?.rota_match_name) names.add(selectedUser.rota_match_name);
    if (selectedDraft.rota_match_name) names.add(selectedDraft.rota_match_name);
    rotaNames.forEach((name) => names.add(name));
    return Array.from(names)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [rotaNames, selectedDraft.rota_match_name, selectedUser?.rota_match_name]);

  const selectedSiteOptions = React.useMemo(() => {
    const options = [...sites];
    if (
      selectedDraft.site_id &&
      !options.some((site) => site.id === selectedDraft.site_id)
    ) {
      options.unshift({
        id: selectedDraft.site_id,
        name: selectedDraft.site_id,
      });
    }
    return options;
  }, [selectedDraft.site_id, sites]);

  const selectedRoleOptions = React.useMemo(
    () => Array.from(new Set([selectedDraft.role, ...ROLES].filter(Boolean))),
    [selectedDraft.role],
  );

  const selectedRotaBranchOptions = React.useMemo(() => {
    if (
      !selectedDraft.rota_branch ||
      ROTA_BRANCH_OPTIONS.some(
        (option) => option.value === selectedDraft.rota_branch,
      )
    ) {
      return ROTA_BRANCH_OPTIONS;
    }

    return [
      { value: selectedDraft.rota_branch, label: selectedDraft.rota_branch },
      ...ROTA_BRANCH_OPTIONS,
    ];
  }, [selectedDraft.rota_branch]);

  const selectedLoginGroupOptions = React.useMemo(() => {
    if (
      !selectedDraft.login_group ||
      LOGIN_GROUP_OPTIONS.some(
        (option) => option.value === selectedDraft.login_group,
      )
    ) {
      return LOGIN_GROUP_OPTIONS;
    }

    return [
      { value: selectedDraft.login_group, label: selectedDraft.login_group },
      ...LOGIN_GROUP_OPTIONS,
    ];
  }, [selectedDraft.login_group]);

  React.useEffect(() => {
    if (mode === "new") return;
    if (!rows.length) {
      setSelectedUserId("");
      return;
    }

    if (
      !selectedUserId ||
      !rows.some((row) => row.user_id === selectedUserId)
    ) {
      setSelectedUserId(rows[0].user_id);
    }
  }, [mode, rows, selectedUserId]);

  React.useEffect(() => {
    if (mode === "new") return;
    setSelectedDraft(profileToDraft(selectedUser));
  }, [mode, selectedUser]);

  async function beginNewStaff() {
    setMode("new");
    setSelectedUserId("");
    setError("");
    if (rotaNames.length === 0 && !rotaNamesLoading) await loadRotaNames();
  }

  function cancelNewStaff() {
    setMode("detail");
    setDisplayName("");
    setSiteId("");
    setRole("agent");
    setPin("");
    setNewRotaName("");
    setNewRotaBranch("");
    setNewLoginGroup("");
  }

  async function createUser(e) {
    e.preventDefault();
    setError("");

    const u = generatedUsername.trim();
    const dn = displayName.trim() || u;
    const s = siteId.trim();
    const p = pin.trim();
    const rotaName = newRotaName.trim();
    const rotaBranch = newRotaBranch.trim();
    const loginGroup = newLoginGroup.trim();

    if (!u) return setError("Username could not be generated.");
    if (!s) return setError("Please select a site.");
    if (!p) return setError("PIN is required.");

    setCreating(true);
    try {
      const createRes = await invokeAdmin("admin_create_staff", {
        username: u,
        display_name: dn,
        site_id: s,
        role,
        pin: p,
      });

      if (createRes?.error)
        throw new Error(createRes.error.message || "admin_create_staff failed");

      await new Promise((r) => setTimeout(r, 250));

      let createdUserId = "";
      if (rotaName || rotaBranch || loginGroup) {
        const staffRes = await invokeAdmin("admin_list_staff", {});
        if (staffRes?.error)
          throw new Error(staffRes.error.message || "admin_list_staff failed");

        const freshRows = staffRes?.data?.staff || [];
        const created = freshRows.find(
          (row) => normalizeText(row.username) === normalizeText(u),
        );
        createdUserId = created?.user_id || "";

        if (createdUserId) {
          const rotaRes = await invokeAdmin("admin_update_staff_rota", {
            user_id: createdUserId,
            rota_match_name: rotaName,
            rota_branch: rotaBranch,
            login_group: loginGroup,
          });

          if (rotaRes?.error)
            throw new Error(
              rotaRes.error.message || "admin_update_staff_rota failed",
            );
        } else {
          setError(
            "Staff user was created, but the Sage HR link could not be applied automatically.",
          );
        }
      }

      setDisplayName("");
      setSiteId("");
      setRole("agent");
      setPin("");
      setNewRotaName("");
      setNewRotaBranch("");
      setNewLoginGroup("");
      setMode("detail");

      await loadAll();
      if (createdUserId) setSelectedUserId(createdUserId);
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setCreating(false);
    }
  }

  async function resetPin(user_id) {
    const newPin = window.prompt("Enter a new PIN (min 6 chars):");
    if (!newPin) return;

    try {
      const res = await invokeAdmin("admin_reset_pin", {
        user_id,
        new_pin: newPin,
      });
      if (res?.error)
        throw new Error(res.error.message || "admin_reset_pin failed");
      alert("PIN reset successfully.");
    } catch (e) {
      console.error(e);
      alert(String(e.message || e));
    }
  }

  async function deactivate(user_id) {
    if (!window.confirm("Deactivate this user?")) return;

    try {
      const res = await invokeAdmin("admin_deactivate_staff", { user_id });
      if (res?.error)
        throw new Error(res.error.message || "admin_deactivate_staff failed");
      await loadAll();
    } catch (e) {
      console.error(e);
      alert(String(e.message || e));
    }
  }

  async function updateRota(user_id, patch) {
    try {
      const res = await invokeAdmin("admin_update_staff_rota", {
        user_id,
        ...patch,
      });
      if (res?.error)
        throw new Error(res.error.message || "admin_update_staff_rota failed");
      await loadAll();
      await loadRotaNames();
    } catch (e) {
      console.error(e);
      alert(String(e.message || e));
    }
  }

  async function saveSelectedRota() {
    if (!selectedUser) return;
    if (!selectedDraft.display_name.trim()) {
      setError("Display name is required.");
      return;
    }

    await updateRota(selectedUser.user_id, {
      site_id: selectedDraft.site_id.trim(),
      display_name: selectedDraft.display_name.trim(),
      role: selectedDraft.role.trim(),
      rota_branch: selectedDraft.rota_branch.trim(),
      login_group: selectedDraft.login_group.trim(),
      rota_match_name: selectedDraft.rota_match_name.trim(),
    });
  }

  function updateSelectedDraft(key, value) {
    setSelectedDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div
      className="users-admin-page"
      style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}
    >
      <header className="users-admin-header">
        <div>
          <h2>Users</h2>
        </div>

        <div className="users-admin-header-actions">
          <button type="button" onClick={loadAll} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={beginNewStaff}
            className="users-admin-primary-button"
          >
            New staff member
          </button>
        </div>
      </header>

      {error ? <div className="users-admin-error">{error}</div> : null}

      <main className="users-admin-layout">
        <aside className="users-admin-element users-admin-list-panel">
          <div className="users-admin-panel-heading">
            <span>Staff</span>
            <span>{rows.length}</span>
          </div>

          <div className="users-admin-staff-list">
            {loading ? (
              <div className="users-admin-empty">Loading staff...</div>
            ) : rows.length === 0 ? (
              <div className="users-admin-empty">No staff users.</div>
            ) : (
              rows.map((user) => {
                const isSelected =
                  mode !== "new" && user.user_id === selectedUserId;

                return (
                  <button
                    key={user.user_id}
                    type="button"
                    className={`users-admin-staff-row ${
                      isSelected ? "users-admin-staff-row--selected" : ""
                    }`}
                    onClick={() => {
                      setMode("detail");
                      setSelectedUserId(user.user_id);
                      setError("");
                    }}
                  >
                    <span className="users-admin-staff-main">
                      <span className="users-admin-staff-name">
                        {user.display_name || user.username}
                      </span>
                      <span className="users-admin-staff-meta">
                        {formatSite(user.site_id, sites)} / {user.role || "-"}
                      </span>
                    </span>
                    <span
                      className={`users-admin-status ${
                        user.is_active
                          ? "users-admin-status--active"
                          : "users-admin-status--inactive"
                      }`}
                    >
                      {statusLabel(user.is_active)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="users-admin-element users-admin-detail-panel">
          {mode === "new" ? (
            <form onSubmit={createUser} className="users-admin-detail-shell">
              <div className="users-admin-detail-card">
                <div className="users-admin-detail-header">
                  <div>
                    <div className="users-admin-kicker">New staff member</div>
                    <h3>Create staff access</h3>
                  </div>
                </div>

                <div className="users-admin-form-grid">
                  <label className="users-admin-field">
                    <span>Display name</span>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ross"
                      autoComplete="off"
                      required
                    />
                  </label>

                  <label className="users-admin-field">
                    <span>Generated username</span>
                    <input value={generatedUsername} readOnly tabIndex={-1} />
                  </label>

                  <label className="users-admin-field">
                    <span>Site</span>
                    <select
                      value={siteId}
                      onChange={(e) => setSiteId(e.target.value)}
                      required
                    >
                      <option value="">Select a site...</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name ? `${site.name} (${site.id})` : site.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>Role</span>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      {ROLES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>Login group</span>
                    <select
                      value={newLoginGroup}
                      onChange={(e) => setNewLoginGroup(e.target.value)}
                    >
                      {LOGIN_GROUP_OPTIONS.map((option) => (
                        <option
                          key={option.value || "site"}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>Rota branch</span>
                    <select
                      value={newRotaBranch}
                      onChange={(e) => setNewRotaBranch(e.target.value)}
                    >
                      {ROTA_BRANCH_OPTIONS.map((option) => (
                        <option
                          key={option.value || "default"}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>PIN</span>
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Minimum 6 chars"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </label>

                  <label className="users-admin-field">
                    <span>Sage HR rota name</span>
                    <select
                      value={newRotaName}
                      onChange={(e) => setNewRotaName(e.target.value)}
                      onFocus={() => {
                        if (rotaNames.length === 0 && !rotaNamesLoading)
                          loadRotaNames();
                      }}
                    >
                      <option value="">
                        {rotaNamesLoading ? "Loading..." : "No link yet"}
                      </option>
                      {rotaNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="users-admin-note">
                  Username is generated from the selected site and display name.
                  Existing usernames are left untouched. Login group controls
                  the HUB sign-in grouping only.
                </div>
              </div>

              <div className="users-admin-sticky-footer">
                <button type="button" onClick={cancelNewStaff}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={loadRotaNames}
                  disabled={rotaNamesLoading}
                >
                  {rotaNamesLoading
                    ? "Loading Sage names..."
                    : "Refresh Sage names"}
                </button>
                <button
                  type="submit"
                  disabled={creating || !siteId || !pin || !displayName.trim()}
                  className="users-admin-primary-button"
                >
                  {creating ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          ) : selectedUser ? (
            <div className="users-admin-detail-shell">
              <div className="users-admin-detail-card">
                <div className="users-admin-detail-header">
                  <div>
                    <div className="users-admin-kicker">Staff member</div>
                    <h3>
                      {selectedUser.display_name || selectedUser.username}
                    </h3>
                  </div>
                  <span
                    className={`users-admin-status ${
                      selectedUser.is_active
                        ? "users-admin-status--active"
                        : "users-admin-status--inactive"
                    }`}
                  >
                    {statusLabel(selectedUser.is_active)}
                  </span>
                </div>

                <div className="users-admin-form-grid">
                  <label className="users-admin-field">
                    <span>Username</span>
                    <input value={selectedUser.username || ""} readOnly />
                  </label>

                  <label className="users-admin-field">
                    <span>Display name</span>
                    <input
                      value={selectedDraft.display_name}
                      onChange={(e) =>
                        updateSelectedDraft("display_name", e.target.value)
                      }
                      autoComplete="off"
                    />
                  </label>

                  <label className="users-admin-field">
                    <span>Site</span>
                    <select
                      value={selectedDraft.site_id}
                      onChange={(e) =>
                        updateSelectedDraft("site_id", e.target.value)
                      }
                    >
                      {selectedSiteOptions.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name ? `${site.name} (${site.id})` : site.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>Role</span>
                    <select
                      value={selectedDraft.role}
                      onChange={(e) =>
                        updateSelectedDraft("role", e.target.value)
                      }
                    >
                      {selectedRoleOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>Rota branch</span>
                    <select
                      value={selectedDraft.rota_branch}
                      onChange={(e) =>
                        updateSelectedDraft("rota_branch", e.target.value)
                      }
                    >
                      {selectedRotaBranchOptions.map((option) => (
                        <option
                          key={option.value || "default"}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field">
                    <span>Login group</span>
                    <select
                      value={selectedDraft.login_group}
                      onChange={(e) =>
                        updateSelectedDraft("login_group", e.target.value)
                      }
                    >
                      {selectedLoginGroupOptions.map((option) => (
                        <option
                          key={option.value || "site"}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="users-admin-field users-admin-field--wide">
                    <span>Sage HR rota linked name</span>
                    <select
                      value={selectedDraft.rota_match_name}
                      onChange={(e) =>
                        updateSelectedDraft("rota_match_name", e.target.value)
                      }
                      onFocus={() => {
                        if (rotaNames.length === 0 && !rotaNamesLoading)
                          loadRotaNames();
                      }}
                    >
                      <option value="">Use display name / no override</option>
                      {selectedRotaOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="users-admin-note">
                  Login group controls the HUB sign-in grouping. If blank, login
                  falls back to the operational site. Rota branch is kept as a
                  separate rota/profile hint.
                </div>
              </div>

              <div className="users-admin-sticky-footer">
                <button
                  type="button"
                  onClick={loadRotaNames}
                  disabled={rotaNamesLoading}
                >
                  {rotaNamesLoading
                    ? "Loading Sage names..."
                    : "Refresh Sage names"}
                </button>
                <button
                  type="button"
                  onClick={saveSelectedRota}
                  className="users-admin-primary-button"
                >
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => resetPin(selectedUser.user_id)}
                >
                  Reset PIN
                </button>
                <button
                  type="button"
                  onClick={() => deactivate(selectedUser.user_id)}
                  className="users-admin-danger-button"
                >
                  Deactivate
                </button>
              </div>
            </div>
          ) : (
            <div className="users-admin-empty">Select a staff member.</div>
          )}
        </section>
      </main>
    </div>
  );
}
