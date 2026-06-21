import React from "react";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import "./AppointmentTypesAdmin.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blankDraft() {
  return {
    id: "",
    fullName: "",
    email: "",
    phone: "",
  };
}

function toDraft(customer) {
  if (!customer) return blankDraft();
  return {
    id: customer.id || "",
    fullName: customer.full_name || "",
    email: customer.email || "",
    phone: customer.phone || "",
  };
}

function readErrorMessage(err, fallback) {
  return err?.message || err?.error_description || fallback;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function branchLabel(branch) {
  const value = String(branch || "").toUpperCase();
  if (value === "DUK") return "Duke Street";
  if (value === "STE") return "St Enoch";
  return branch || "Unknown";
}

export default function AppointmentCustomersAdmin() {
  const [role, setRole] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [customers, setCustomers] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState(null);
  const [historyRows, setHistoryRows] = React.useState([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState(blankDraft);
  const [toast, setToast] = React.useState(null);
  const toastTimerRef = React.useRef(null);

  const canManage = role === "admin" || role === "manager";
  const isNewCustomer = selectedCustomerId === "__new__";

  const inputStyle = React.useMemo(
    () => ({
      width: "100%",
      padding: "10px 12px",
      borderRadius: ui.radius.md,
      border: `1px solid ${ui.colors.border}`,
      background: ui.colors.cardBg,
      color: ui.colors.text,
      outline: "none",
      boxSizing: "border-box",
      fontFamily: ui.font.ui,
    }),
    [],
  );

  const buttonStyle = React.useMemo(
    () => ({
      padding: "9px 12px",
      borderRadius: ui.radius.md,
      border: `1px solid ${ui.colors.border}`,
      background: ui.colors.cardBg,
      color: ui.colors.text,
      cursor: "pointer",
      fontWeight: 900,
    }),
    [],
  );

  const primaryButtonStyle = React.useMemo(
    () => ({
      ...buttonStyle,
      border: "1px solid rgba(168,85,247,0.35)",
      background: ui.colors.brandSoft,
    }),
    [buttonStyle],
  );

  const cardStyle = React.useMemo(
    () => ({
      borderRadius: ui.radius.lg,
      border: `1px solid ${ui.colors.border}`,
      background: ui.colors.cardBg,
      boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
    }),
    [],
  );

  const showToast = React.useCallback((type, message, timeoutMs) => {
    if (!message) return;
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, timeoutMs ?? (type === "error" ? 9000 : 4500));
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const loadCustomers = React.useCallback(
    async (query, options = {}) => {
      if (!canManage) return [];
      if (!options.quiet) setSearching(true);

      try {
        const { data, error } = await supabase.rpc(
          "list_appointment_customers_cms_staff",
          {
            p_query: query || "",
            p_limit: 50,
          },
        );

        if (error) throw error;
        const nextCustomers = data || [];
        setCustomers(nextCustomers);
        return nextCustomers;
      } catch (err) {
        console.error("appointment customers: list failed", err);
        showToast("error", readErrorMessage(err, "Could not load customers."));
        setCustomers([]);
        return [];
      } finally {
        if (!options.quiet) setSearching(false);
      }
    },
    [canManage, showToast],
  );

  const loadSelectedCustomer = React.useCallback(
    async (customerId) => {
      if (!canManage || !customerId || customerId === "__new__") return;

      setDetailLoading(true);
      try {
        const [detailRes, historyRes] = await Promise.all([
          supabase.rpc("get_appointment_customer_detail_staff", {
            p_customer_id: customerId,
          }),
          supabase.rpc("get_appointment_customer_history_staff", {
            p_customer_id: customerId,
            p_limit: 10,
          }),
        ]);

        if (detailRes.error) throw detailRes.error;
        if (historyRes.error) throw historyRes.error;

        const detail = Array.isArray(detailRes.data)
          ? detailRes.data[0]
          : detailRes.data;

        if (!detail) {
          throw new Error("That customer could not be found.");
        }

        setSelectedCustomer(detail);
        setDraft(toDraft(detail));
        setHistoryRows(historyRes.data || []);
      } catch (err) {
        console.error("appointment customers: detail failed", err);
        showToast(
          "error",
          readErrorMessage(err, "Could not load customer details."),
        );
        setSelectedCustomerId("");
        setSelectedCustomer(null);
        setDraft(blankDraft());
        setHistoryRows([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [canManage, showToast],
  );

  const loadInitial = React.useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("No active session.");

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("role, is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.is_active) {
        throw new Error("Your staff profile is inactive or missing.");
      }

      const nextRole = String(profile.role || "").toLowerCase();
      setRole(nextRole);

      if (!["admin", "manager"].includes(nextRole)) {
        setCustomers([]);
        return;
      }
    } catch (err) {
      console.error("appointment customers: bootstrap failed", err);
      showToast("error", readErrorMessage(err, "Could not load customers."));
      setRole("");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  React.useEffect(() => {
    if (!canManage) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const nextCustomers = await loadCustomers(search);
      if (cancelled) return;

      setSelectedCustomerId((current) => {
        if (current === "__new__") return current;
        if (current && nextCustomers.some((item) => item.id === current)) {
          return current;
        }
        return "";
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canManage, loadCustomers, search]);

  React.useEffect(() => {
    if (selectedCustomerId === "__new__") {
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      return;
    }

    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      return;
    }

    loadSelectedCustomer(selectedCustomerId);
  }, [loadSelectedCustomer, selectedCustomerId]);

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function beginNewCustomer() {
    setSelectedCustomerId("__new__");
    setSelectedCustomer(null);
    setHistoryRows([]);
    setDraft(blankDraft());
  }

  function discardChanges() {
    setSelectedCustomerId("");
    setSelectedCustomer(null);
    setDraft(blankDraft());
    setHistoryRows([]);
    showToast("info", "Changes discarded.");
  }

  async function saveCustomer(e) {
    e.preventDefault();

    if (!draft.fullName.trim()) {
      showToast("error", "Full name is required.");
      return;
    }

    if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) {
      showToast("error", "Enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const rpcName = isNewCustomer
        ? "create_appointment_customer_staff"
        : "update_appointment_customer_staff";
      const rpcParams = isNewCustomer
        ? {
            p_full_name: draft.fullName.trim(),
            p_email: draft.email.trim() || null,
            p_phone: draft.phone.trim() || null,
          }
        : {
            p_customer_id: draft.id,
            p_full_name: draft.fullName.trim(),
            p_email: draft.email.trim() || null,
            p_phone: draft.phone.trim() || null,
          };

      const { error } = await supabase.rpc(rpcName, rpcParams);
      if (error) throw error;

      const nextCustomers = await loadCustomers(search, { quiet: true });
      setSelectedCustomerId("");
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      showToast("success", isNewCustomer ? "Customer created." : "Customer saved.");

      if (nextCustomers.length === 0 && search.trim()) {
        await loadCustomers("", { quiet: true });
      }
    } catch (err) {
      console.error("appointment customers: save failed", err);
      showToast("error", readErrorMessage(err, "Could not save customer."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading customers...</div>;
  }

  if (!canManage) {
    return (
      <div style={{ padding: 24, color: ui.colors.text }}>
        Only admins and managers can manage appointment customers.
      </div>
    );
  }

  return (
    <div
      className="appointment-types-admin"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        color: ui.colors.text,
        fontFamily: ui.font.ui,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Customers</h2>
          <div style={ui.text.subtitle}>
            Manage appointment customer records without changing old appointment
            snapshots.
          </div>
        </div>
        <button type="button" onClick={beginNewCustomer} style={primaryButtonStyle}>
          New customer
        </button>
      </div>

      <div
        className="appointment-admin-layout"
        style={{
          marginTop: 18,
          gridTemplateColumns: "minmax(340px, 0.52fr) minmax(420px, 0.48fr)",
        }}
      >
        <section className="appointment-admin-column">
          <div
            className="appointment-admin-main-card"
            style={{
              ...cardStyle,
              padding: 16,
              height: "calc(100vh - 190px)",
              gridTemplateRows: "auto minmax(0, 1fr)",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: 8,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              <span>Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, or phone"
                style={inputStyle}
              />
            </label>

            <div
              className="appointment-admin-selector-card appointment-admin-scroll"
              style={{ padding: 12, maxHeight: "none" }}
            >
              {searching ? (
                <div style={{ padding: 8, color: ui.colors.muted }}>
                  Loading customers...
                </div>
              ) : customers.length === 0 ? (
                <div style={{ padding: 8, color: ui.colors.muted }}>
                  No customers found.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {customers.map((customer) => {
                    const isSelected = selectedCustomerId === customer.id;

                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(customer.id)}
                        style={{
                          width: "100%",
                          display: "grid",
                          gap: 5,
                          padding: 12,
                          borderRadius: ui.radius.md,
                          border: isSelected
                            ? "1px solid rgba(168,85,247,0.45)"
                            : `1px solid ${ui.colors.border}`,
                          background: isSelected
                            ? "rgba(168,85,247,0.10)"
                            : ui.colors.cardBg,
                          color: ui.colors.text,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "start",
                          }}
                        >
                          <strong
                            style={{
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {customer.full_name || "Unnamed customer"}
                          </strong>
                          <span
                            style={{
                              flex: "0 0 auto",
                              fontSize: 12,
                              fontWeight: 800,
                              color: ui.colors.muted,
                            }}
                          >
                            {Number(customer.appointment_count || 0)} appts
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: ui.colors.muted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {[customer.email, customer.phone]
                            .filter(Boolean)
                            .join(" / ") || "No email or phone"}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: ui.colors.muted,
                          }}
                        >
                          Last appointment:{" "}
                          {customer.last_appointment_at
                            ? formatDateTime(customer.last_appointment_at)
                            : "None"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="appointment-admin-column">
          <div
            className="appointment-admin-main-card"
            style={{
              ...cardStyle,
              padding: 16,
              height: "calc(100vh - 190px)",
            }}
          >
            {!selectedCustomerId ? (
              <div
                className="appointment-admin-detail-card"
                style={{
                  display: "grid",
                  alignContent: "center",
                  justifyItems: "center",
                  textAlign: "center",
                  color: ui.colors.muted,
                }}
              >
                Select a customer or create a new one.
              </div>
            ) : (
              <form
                onSubmit={saveCustomer}
                className="appointment-admin-detail-shell"
              >
                <div
                  className="appointment-admin-detail-card appointment-admin-scroll"
                  style={{ display: "grid", gap: 16 }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {isNewCustomer ? "New customer" : "Customer details"}
                    </div>
                    {!isNewCustomer && selectedCustomer ? (
                      <div style={{ marginTop: 4, color: ui.colors.muted }}>
                        {Number(selectedCustomer.appointment_count || 0)} linked
                        appointments
                      </div>
                    ) : null}
                  </div>

                  {detailLoading ? (
                    <div style={{ color: ui.colors.muted }}>
                      Loading customer details...
                    </div>
                  ) : (
                    <>
                      <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                        <span>Full name</span>
                        <input
                          value={draft.fullName}
                          onChange={(e) =>
                            updateDraft("fullName", e.target.value)
                          }
                          style={inputStyle}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                        <span>Email</span>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(e) => updateDraft("email", e.target.value)}
                          style={inputStyle}
                        />
                      </label>

                      <label style={{ display: "grid", gap: 8, fontWeight: 800 }}>
                        <span>Phone</span>
                        <input
                          value={draft.phone}
                          onChange={(e) => updateDraft("phone", e.target.value)}
                          style={inputStyle}
                        />
                      </label>

                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          paddingTop: 8,
                          borderTop: `1px solid ${ui.colors.border}`,
                        }}
                      >
                        <div style={{ fontSize: 15, fontWeight: 900 }}>
                          Recent appointments
                        </div>

                        {isNewCustomer ? (
                          <div style={{ color: ui.colors.muted }}>
                            Appointment history will appear after this customer
                            is linked to bookings.
                          </div>
                        ) : historyRows.length === 0 ? (
                          <div style={{ color: ui.colors.muted }}>
                            No linked appointments yet.
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {historyRows.map((appointment) => (
                              <div
                                key={appointment.id}
                                style={{
                                  display: "grid",
                                  gap: 4,
                                  padding: 10,
                                  borderRadius: ui.radius.md,
                                  border: `1px solid ${ui.colors.border}`,
                                  background: "rgba(248, 250, 252, 0.75)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    alignItems: "start",
                                  }}
                                >
                                  <strong>
                                    {formatDateTime(appointment.start_at)}
                                  </strong>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 900,
                                      textTransform: "capitalize",
                                      color: ui.colors.muted,
                                    }}
                                  >
                                    {appointment.status}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: ui.colors.muted,
                                  }}
                                >
                                  {appointment.appointment_type_name ||
                                    "Appointment"}{" "}
                                  - {branchLabel(appointment.branch)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="appointment-admin-sticky-footer">
                  <button
                    type="button"
                    onClick={discardChanges}
                    disabled={saving}
                    style={buttonStyle}
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={saving || detailLoading}
                    style={{
                      ...primaryButtonStyle,
                      opacity: saving || detailLoading ? 0.65 : 1,
                      cursor:
                        saving || detailLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? "Saving..." : "Save & close"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live={toast.type === "error" ? "assertive" : "polite"}
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 950,
            maxWidth: 420,
            padding: "14px 16px",
            borderRadius: ui.radius.lg,
            border:
              toast.type === "error"
                ? "1px solid rgba(239,68,68,0.35)"
                : toast.type === "success"
                  ? "1px solid rgba(16,185,129,0.35)"
                  : `1px solid ${ui.colors.border}`,
            background:
              toast.type === "error"
                ? "rgba(239,68,68,0.08)"
                : toast.type === "success"
                  ? "rgba(16,185,129,0.08)"
                  : ui.colors.cardBg,
            color: ui.colors.text,
            boxShadow: "0 14px 32px rgba(15, 23, 42, 0.18)",
            fontWeight: 800,
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
