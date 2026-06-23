import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import { normalizePhoneNumber } from "../lib/phone";
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

function formatShortDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "None";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function attendanceOutcomeLabel(status) {
  if (status === "checked_in") return "Checked in";
  if (status === "checked_in_late") return "Checked in late";
  if (status === "no_show") return "No-show";
  return "";
}

function feedbackEmailStatusLabel(appointment) {
  if (appointment?.feedback_email_sent_at) return "Feedback sent";
  if (appointment?.feedback_email_status === "failed") return "Feedback failed";
  return "";
}

function branchLabel(branch) {
  const value = String(branch || "").toUpperCase();
  if (value === "DUK") return "Duke Street";
  if (value === "STE") return "St Enoch";
  return branch || "Unknown";
}

function branchToSiteId(branch) {
  const value = String(branch || "").toUpperCase();
  if (value === "DUK") return "duke";
  if (value === "STE") return "sten";
  return "";
}

function inputDateValueFromIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function canCancelAppointment(appointment) {
  if (!appointment || appointment.status === "cancelled") return false;
  const end = new Date(appointment.end_at || appointment.start_at);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() >= Date.now();
}

export default function AppointmentCustomersAdmin() {
  const navigate = useNavigate();
  const [role, setRole] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [customers, setCustomers] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState(null);
  const [historyRows, setHistoryRows] = React.useState([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [actionSaving, setActionSaving] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeQuery, setMergeQuery] = React.useState("");
  const [mergeCandidates, setMergeCandidates] = React.useState([]);
  const [mergeDuplicateId, setMergeDuplicateId] = React.useState("");
  const [mergeSearching, setMergeSearching] = React.useState(false);
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
    toastTimerRef.current = window.setTimeout(
      () => {
        setToast(null);
        toastTimerRef.current = null;
      },
      timeoutMs ?? (type === "error" ? 9000 : 4500),
    );
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
            p_include_archived: showArchived,
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
    [canManage, showArchived, showToast],
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
  }, [canManage, loadCustomers, search, showArchived]);

  React.useEffect(() => {
    if (!canManage || !mergeOpen) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setMergeSearching(true);
      try {
        const { data, error } = await supabase.rpc(
          "list_appointment_customers_cms_staff",
          {
            p_query: mergeQuery || "",
            p_limit: 25,
            p_include_archived: false,
          },
        );

        if (error) throw error;
        if (cancelled) return;
        setMergeCandidates(
          (data || []).filter((item) => item.id !== selectedCustomerId),
        );
      } catch (err) {
        console.error("appointment customers: merge search failed", err);
        if (!cancelled) {
          setMergeCandidates([]);
          showToast(
            "error",
            readErrorMessage(err, "Could not search duplicate customers."),
          );
        }
      } finally {
        if (!cancelled) setMergeSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canManage, mergeOpen, mergeQuery, selectedCustomerId, showToast]);

  React.useEffect(() => {
    if (selectedCustomerId === "__new__") {
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      setMergeOpen(false);
      setMergeDuplicateId("");
      return;
    }

    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      setMergeOpen(false);
      setMergeDuplicateId("");
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
    setMergeOpen(false);
    setMergeDuplicateId("");
  }

  function discardChanges() {
    setSelectedCustomerId("");
    setSelectedCustomer(null);
    setDraft(blankDraft());
    setHistoryRows([]);
    setMergeOpen(false);
    setMergeDuplicateId("");
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
            p_phone: normalizePhoneNumber(draft.phone) || null,
          }
        : {
            p_customer_id: draft.id,
            p_full_name: draft.fullName.trim(),
            p_email: draft.email.trim() || null,
            p_phone: normalizePhoneNumber(draft.phone) || null,
          };

      const { error } = await supabase.rpc(rpcName, rpcParams);
      if (error) throw error;

      const nextCustomers = await loadCustomers(search, { quiet: true });
      setSelectedCustomerId("");
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      showToast(
        "success",
        isNewCustomer ? "Customer created." : "Customer saved.",
      );

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

  function openAppointment(appointment) {
    const site = branchToSiteId(appointment.branch);
    const date = inputDateValueFromIso(appointment.start_at);
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (site) params.set("site", site);
    params.set("appointment", appointment.id);
    navigate(`/appointments?${params.toString()}`);
  }

  async function cancelAppointment(appointment) {
    if (!appointment) return;
    if (!window.confirm("Cancel this appointment?")) return;

    setActionSaving(true);
    try {
      const { error } = await supabase.rpc(
        "cancel_customer_appointment_staff",
        {
          p_appointment_id: appointment.id,
        },
      );

      if (error) throw error;
      await loadSelectedCustomer(selectedCustomerId);
      await loadCustomers(search, { quiet: true });
      showToast("success", "Appointment cancelled.");
    } catch (err) {
      console.error("appointment customers: cancel appointment failed", err);
      showToast(
        "error",
        readErrorMessage(err, "Could not cancel appointment."),
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function archiveCustomer() {
    if (!selectedCustomerId || selectedCustomerId === "__new__") return;
    if (!window.confirm("Archive this customer?")) return;

    setActionSaving(true);
    try {
      const { error } = await supabase.rpc(
        "archive_appointment_customer_staff",
        {
          p_customer_id: selectedCustomerId,
        },
      );

      if (error) throw error;
      setSelectedCustomerId("");
      setSelectedCustomer(null);
      setDraft(blankDraft());
      setHistoryRows([]);
      setMergeOpen(false);
      setMergeDuplicateId("");
      await loadCustomers(search, { quiet: true });
      showToast("success", "Customer archived.");
    } catch (err) {
      console.error("appointment customers: archive failed", err);
      showToast("error", readErrorMessage(err, "Could not archive customer."));
    } finally {
      setActionSaving(false);
    }
  }

  async function mergeCustomer() {
    if (!selectedCustomerId || !mergeDuplicateId) {
      showToast("error", "Choose a duplicate customer to merge.");
      return;
    }

    const duplicate = mergeCandidates.find(
      (item) => item.id === mergeDuplicateId,
    );
    const duplicateLabel = duplicate?.full_name || "the duplicate customer";
    if (
      !window.confirm(
        `Merge ${duplicateLabel} into ${draft.fullName || "this customer"}? Appointment snapshots will stay unchanged.`,
      )
    ) {
      return;
    }

    setActionSaving(true);
    try {
      const { error } = await supabase.rpc(
        "merge_appointment_customers_staff",
        {
          p_primary_customer_id: selectedCustomerId,
          p_duplicate_customer_id: mergeDuplicateId,
        },
      );

      if (error) throw error;
      setMergeOpen(false);
      setMergeDuplicateId("");
      setMergeQuery("");
      await loadSelectedCustomer(selectedCustomerId);
      await loadCustomers(search, { quiet: true });
      showToast("success", "Customers merged.");
    } catch (err) {
      console.error("appointment customers: merge failed", err);
      showToast("error", readErrorMessage(err, "Could not merge customers."));
    } finally {
      setActionSaving(false);
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
      className="appointment-types-admin appointment-customers-admin-page"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        color: ui.colors.text,
        fontFamily: ui.font.ui,
        overflowY: "hidden",
        overflowX: "hidden",
      }}
    >
      <div
        className="appointment-admin-header"
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
        </div>
        <button
          type="button"
          onClick={beginNewCustomer}
          style={primaryButtonStyle}
        >
          New customer
        </button>
      </div>

      <div
        className="appointment-admin-layout"
        style={{
          marginTop: 18,
          gridTemplateColumns: "minmax(340px, 1fr) minmax(520px, 2fr)",
          flex: "1 1 auto",
          minHeight: 0,
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        <section
          className="appointment-admin-column"
          style={{ minHeight: 0, display: "flex" }}
        >
          <div
            className="appointment-admin-main-card appointment-customers-list-stack"
            style={{
              width: "100%",
              height: "100%",
              minHeight: 0,
              gridTemplateRows: "auto minmax(0, 1fr)",
            }}
          >
            <div className="appointment-admin-selector-card appointment-customers-search-card">
              <label>Search</label>

              <div className="appointment-customers-search-row">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, or phone"
                  style={inputStyle}
                />

                <label className="appointment-customer-archive-toggle">
                  <input
                    className="appointment-confirm-checkbox"
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  <span>Show archived</span>
                </label>
              </div>
            </div>

            <div
              className="appointment-admin-selector-card appointment-admin-scroll"
              style={{
                padding: 12,
                maxHeight: "none",
                minHeight: 0,
              }}
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
                              color: customer.is_active
                                ? ui.colors.muted
                                : "#991b1b",
                            }}
                          >
                            {customer.is_active === false
                              ? "Archived"
                              : `${Number(customer.appointment_count || 0)} appts`}
                          </span>
                        </div>
                        {Number(customer.duplicate_email_count || 0) > 0 ? (
                          <div
                            style={{
                              width: "fit-content",
                              padding: "3px 7px",
                              borderRadius: 999,
                              border: "1px solid rgba(245,158,11,0.35)",
                              background: "rgba(245,158,11,0.10)",
                              color: "#92400e",
                              fontSize: 11,
                              fontWeight: 900,
                            }}
                          >
                            Possible duplicate
                          </div>
                        ) : null}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: 12,
                            alignItems: "start",
                          }}
                        >
                          <div
                            style={{
                              minWidth: 0,
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
                              textAlign: "right",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Last app:{" "}
                            {customer.last_appointment_at
                              ? formatShortDateTime(
                                  customer.last_appointment_at,
                                )
                              : "None"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className="appointment-admin-column"
          style={{ minHeight: 0, display: "flex" }}
        >
          <div
            className="appointment-admin-main-card"
            style={{
              ...cardStyle,
              padding: 16,
              width: "100%",
              height: "100%",
              minHeight: 0,
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
                  style={{
                    display: "grid",
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>
                      {isNewCustomer ? "New customer" : "Customer details"}
                    </div>
                    {!isNewCustomer && selectedCustomer ? (
                      <div style={{ marginTop: 4, color: ui.colors.muted }}>
                        {Number(selectedCustomer.appointment_count || 0)} linked
                        appointments
                        {selectedCustomer.is_active === false
                          ? " / archived"
                          : ""}
                      </div>
                    ) : null}
                  </div>

                  {detailLoading ? (
                    <div style={{ color: ui.colors.muted }}>
                      Loading customer details...
                    </div>
                  ) : (
                    <>
                      <label
                        style={{ display: "grid", gap: 8, fontWeight: 800 }}
                      >
                        <span>Full name</span>
                        <input
                          value={draft.fullName}
                          onChange={(e) =>
                            updateDraft("fullName", e.target.value)
                          }
                          style={inputStyle}
                        />
                      </label>

                      <label
                        style={{ display: "grid", gap: 8, fontWeight: 800 }}
                      >
                        <span>Email</span>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(e) => updateDraft("email", e.target.value)}
                          style={inputStyle}
                        />
                      </label>

                      <label
                        style={{ display: "grid", gap: 8, fontWeight: 800 }}
                      >
                        <span>Phone</span>
                        <input
                          value={draft.phone}
                          onChange={(e) => updateDraft("phone", e.target.value)}
                          style={inputStyle}
                        />
                      </label>

                      {!isNewCustomer &&
                      selectedCustomer?.is_active !== false ? (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            paddingTop: 8,
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setMergeOpen((value) => !value);
                              setMergeDuplicateId("");
                            }}
                            disabled={actionSaving}
                            style={buttonStyle}
                          >
                            Merge duplicate
                          </button>
                          <button
                            type="button"
                            onClick={archiveCustomer}
                            disabled={actionSaving}
                            style={{
                              ...buttonStyle,
                            }}
                          >
                            Archive customer
                          </button>
                        </div>
                      ) : null}

                      {mergeOpen ? (
                        <div
                          style={{
                            display: "grid",
                            gap: 10,
                            padding: 12,
                            borderRadius: ui.radius.md,
                            border: `1px solid ${ui.colors.border}`,
                            background: "rgba(248, 250, 252, 0.75)",
                          }}
                        >
                          <div style={{ fontWeight: 900 }}>Merge customer</div>
                          <div style={{ fontSize: 13, color: ui.colors.muted }}>
                            Primary customer:{" "}
                            <strong style={{ color: ui.colors.text }}>
                              {draft.fullName || "Current customer"}
                            </strong>
                          </div>
                          <input
                            value={mergeQuery}
                            onChange={(e) => setMergeQuery(e.target.value)}
                            placeholder="Search duplicate customer"
                            style={inputStyle}
                          />
                          <select
                            value={mergeDuplicateId}
                            onChange={(e) =>
                              setMergeDuplicateId(e.target.value)
                            }
                            style={inputStyle}
                          >
                            <option value="">
                              {mergeSearching
                                ? "Searching..."
                                : "Select duplicate customer..."}
                            </option>
                            {mergeCandidates.map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customer.full_name}
                                {customer.email ? ` - ${customer.email}` : ""}
                              </option>
                            ))}
                          </select>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMergeOpen(false);
                                setMergeDuplicateId("");
                              }}
                              style={buttonStyle}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={mergeCustomer}
                              disabled={actionSaving || !mergeDuplicateId}
                              style={{
                                ...primaryButtonStyle,
                                opacity:
                                  actionSaving || !mergeDuplicateId ? 0.65 : 1,
                              }}
                            >
                              Merge
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          paddingTop: 8,
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
                            {historyRows.map((appointment) => {
                              const isCancelledAppointment =
                                appointment.status === "cancelled";
                              const attendanceLabel = attendanceOutcomeLabel(
                                appointment.attendance_status,
                              );
                              const feedbackLabel =
                                feedbackEmailStatusLabel(appointment);

                              return (
                                <div
                                  key={appointment.id}
                                  className={
                                    isCancelledAppointment
                                      ? "customer-appointment-row customer-appointment-row--cancelled"
                                      : "customer-appointment-row"
                                  }
                                  style={{
                                    display: "grid",
                                    gap: isCancelledAppointment ? 3 : 4,
                                    padding: isCancelledAppointment ? 8 : 10,
                                    borderRadius: ui.radius.md,
                                    border: isCancelledAppointment
                                      ? "1px solid rgba(203, 213, 225, 0.8)"
                                      : `1px solid ${ui.colors.border}`,
                                    background: isCancelledAppointment
                                      ? "rgba(241, 245, 249, 0.82)"
                                      : "rgba(248, 250, 252, 0.75)",
                                    color: isCancelledAppointment
                                      ? "#64748b"
                                      : "inherit",
                                    opacity: isCancelledAppointment ? 0.72 : 1,
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
                                    <strong
                                      style={{
                                        fontSize: isCancelledAppointment
                                          ? 13
                                          : "inherit",
                                      }}
                                    >
                                      {formatDateTime(appointment.start_at)}
                                    </strong>
                                    <span
                                      style={{
                                        fontSize: isCancelledAppointment
                                          ? 11
                                          : 12,
                                        fontWeight: 900,
                                        textTransform: "capitalize",
                                        color: isCancelledAppointment
                                          ? "#475569"
                                          : ui.colors.muted,
                                      }}
                                    >
                                      {appointment.status}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: isCancelledAppointment
                                        ? 12
                                        : 13,
                                      fontWeight: 700,
                                      color: isCancelledAppointment
                                        ? "#64748b"
                                        : ui.colors.muted,
                                    }}
                                  >
                                    {appointment.appointment_type_name ||
                                      "Appointment"}{" "}
                                    - {branchLabel(appointment.branch)}
                                    {attendanceLabel ? (
                                      <span
                                        style={{
                                          marginLeft: 8,
                                          fontSize: isCancelledAppointment
                                            ? 11
                                            : 12,
                                          fontWeight: 900,
                                          color:
                                            appointment.attendance_status ===
                                            "no_show"
                                              ? "#64748b"
                                              : "#047857",
                                        }}
                                      >
                                        {attendanceLabel}
                                      </span>
                                    ) : null}
                                    {feedbackLabel ? (
                                      <span
                                        style={{
                                          marginLeft: 8,
                                          fontSize: isCancelledAppointment
                                            ? 11
                                            : 12,
                                          fontWeight: 900,
                                          color:
                                            appointment.feedback_email_status ===
                                            "failed"
                                              ? "#92400e"
                                              : "#64748b",
                                        }}
                                      >
                                        {feedbackLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "flex-end",
                                      gap: 8,
                                      flexWrap: "wrap",
                                      marginTop: 4,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openAppointment(appointment)
                                      }
                                      style={buttonStyle}
                                    >
                                      Open
                                    </button>
                                    {canCancelAppointment(appointment) ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          cancelAppointment(appointment)
                                        }
                                        disabled={actionSaving}
                                        style={{
                                          ...buttonStyle,
                                        }}
                                      >
                                        Cancel appointment
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div
                  className="appointment-admin-sticky-footer"
                  style={{
                    background: ui.colors.cardBg,
                  }}
                >
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
