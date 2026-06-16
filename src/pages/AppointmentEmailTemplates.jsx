import React from "react";
import { ui } from "../ui/tokens";
import { supabase } from "../supabaseClient";

const SAMPLE_VALUES = {
  customer_name: "Test Customer",
  appointment_type: "Hire Measurement",
  appointment_date: "Friday, 20 June 2026",
  appointment_time: "12:00",
  site_name: "Duke Street",
  area_name: "Area 1",
  staff_name: "Ross",
};

const TEMPLATE_KIND_OPTIONS = [
  { value: "all", label: "All" },
  { value: "confirmation", label: "Confirmation" },
  { value: "reminder", label: "Reminder" },
];

const EDITOR_KIND_OPTIONS = [
  { value: "confirmation", label: "Confirmation" },
  { value: "reminder", label: "Reminder" },
];

const PLACEHOLDERS = [
  "{{customer_name}}",
  "{{appointment_type}}",
  "{{appointment_date}}",
  "{{appointment_time}}",
  "{{site_name}}",
  "{{area_name}}",
  "{{staff_name}}",
];

function applyPlaceholders(template, replacements) {
  let result = String(template || "");

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

function blankDraft() {
  return {
    id: "",
    name: "",
    template_type: "confirmation",
    appointment_type_id: "",
    subject: "",
    body_text: "",
    body_html: "",
    is_active: true,
  };
}

function toDraft(template) {
  if (!template) return blankDraft();

  return {
    id: template.id || "",
    name: template.name || "",
    template_type: template.template_type || "confirmation",
    appointment_type_id: template.appointment_type_id || "",
    subject: template.subject || "",
    body_text: template.body_text || "",
    body_html: template.body_html || "",
    is_active: Boolean(template.is_active),
  };
}

function formatTemplateScope(template) {
  return template.appointment_type_name || "General / default";
}

export default function AppointmentEmailTemplates() {
  const [role, setRole] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [templates, setTemplates] = React.useState([]);
  const [appointmentTypes, setAppointmentTypes] = React.useState([]);
  const [selectedFilter, setSelectedFilter] = React.useState("all");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [draft, setDraft] = React.useState(blankDraft);

  const isAdmin = role === "admin";
  const canView = role === "admin" || role === "manager";
  const isNewTemplate = selectedTemplateId === "__new__";

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
    []
  );

  const appointmentTypeOptions = React.useMemo(() => {
    const map = new Map();

    for (const item of appointmentTypes) {
      map.set(item.id, { id: item.id, name: item.name });
    }

    for (const template of templates) {
      if (template.appointment_type_id && template.appointment_type_name) {
        map.set(template.appointment_type_id, {
          id: template.appointment_type_id,
          name: template.appointment_type_name,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [appointmentTypes, templates]);

  const filteredTemplates = React.useMemo(() => {
    if (selectedFilter === "all") return templates;
    return templates.filter((item) => item.template_type === selectedFilter);
  }, [selectedFilter, templates]);

  const selectedTemplate = React.useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  const previewSubject = React.useMemo(
    () => applyPlaceholders(draft.subject, SAMPLE_VALUES) || "No subject set",
    [draft.subject]
  );

  const previewBody = React.useMemo(
    () => applyPlaceholders(draft.body_text, SAMPLE_VALUES) || "No body text set",
    [draft.body_text]
  );

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError("");

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
      if (!profile?.is_active) throw new Error("Your staff profile is inactive or missing.");

      const nextRole = String(profile.role || "").toLowerCase();
      setRole(nextRole);

      if (!["admin", "manager"].includes(nextRole)) {
        setTemplates([]);
        setAppointmentTypes([]);
        setSelectedTemplateId("");
        setDraft(blankDraft());
        return;
      }

      const [templatesRes, typesRes] = await Promise.all([
        supabase.rpc("get_appointment_email_templates_staff"),
        supabase
          .from("appointment_types")
          .select("id, name, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (typesRes.error) throw typesRes.error;

      const nextTemplates = templatesRes.data || [];
      setTemplates(nextTemplates);
      setAppointmentTypes(typesRes.data || []);

      setSelectedTemplateId((prev) => {
        if (prev === "__new__") return prev;
        if (prev && nextTemplates.some((item) => item.id === prev)) return prev;
        return nextTemplates[0]?.id || "";
      });
    } catch (err) {
      console.error("appointment email templates: load failed", err);
      setError(err?.message || "Could not load appointment email templates.");
      setTemplates([]);
      setAppointmentTypes([]);
      setSelectedTemplateId("");
      setDraft(blankDraft());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  React.useEffect(() => {
    if (selectedTemplateId === "__new__") {
      setDraft(blankDraft());
      return;
    }

    setDraft(toDraft(selectedTemplate));
  }, [selectedTemplate, selectedTemplateId]);

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function beginNewTemplate() {
    setSelectedTemplateId("__new__");
    setDraft(blankDraft());
    setError("");
    setSuccessMessage("");
  }

  function resetChanges() {
    setError("");
    setSuccessMessage("");
    setDraft(selectedTemplateId === "__new__" ? blankDraft() : toDraft(selectedTemplate));
  }

  async function saveTemplate(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!isAdmin) {
      setError("Only admins can edit appointment email templates.");
      return;
    }

    if (!draft.name.trim()) {
      setError("Template name is required.");
      return;
    }

    if (!draft.subject.trim()) {
      setError("Template subject is required.");
      return;
    }

    if (!draft.body_text.trim()) {
      setError("Template body text is required.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        p_name: draft.name.trim(),
        p_template_type: draft.template_type,
        p_appointment_type_id: draft.appointment_type_id || null,
        p_subject: draft.subject.trim(),
        p_body_text: draft.body_text,
        p_body_html: draft.body_html.trim() || null,
      };

      const response = isNewTemplate
        ? await supabase.rpc("create_appointment_email_template_staff", payload)
        : await supabase.rpc("update_appointment_email_template_staff", {
            p_template_id: draft.id,
            ...payload,
            p_is_active: draft.is_active,
          });

      if (response.error) throw response.error;

      const savedTemplate = response.data?.[0] || null;
      await loadAll();
      if (savedTemplate?.id) {
        setSelectedTemplateId(savedTemplate.id);
      }
      setSuccessMessage(isNewTemplate ? "Template created." : "Template saved.");
    } catch (err) {
      console.error("appointment email templates: save failed", err);
      setError(err?.message || "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivateTemplate() {
    if (!isAdmin || !draft.id) return;
    if (!window.confirm("Deactivate this template?")) return;

    setSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      const { error: rpcError } = await supabase.rpc("deactivate_appointment_email_template_staff", {
        p_template_id: draft.id,
      });

      if (rpcError) throw rpcError;

      await loadAll();
      setSuccessMessage("Template deactivated.");
    } catch (err) {
      console.error("appointment email templates: deactivate failed", err);
      setError(err?.message || "Could not deactivate the template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}>
      <div>
        <h2 style={{ margin: 0 }}>Appointment Emails</h2>
        <div style={ui.text.subtitle}>
          Manage reusable appointment confirmation and reminder templates.
        </div>
      </div>

      {loading ? <div style={{ marginTop: 16 }}>Loading templates...</div> : null}

      {!loading && !canView ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
          }}
        >
          You do not have access to appointment email templates.
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.35)",
          }}
        >
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "rgba(34,197,94,0.10)",
            border: "1px solid rgba(34,197,94,0.35)",
          }}
        >
          {successMessage}
        </div>
      ) : null}

      {!loading && canView ? (
        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "320px minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              border: `1px solid ${ui.colors.border}`,
              borderRadius: 12,
              background: ui.colors.cardBg,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: `1px solid ${ui.colors.border}`,
                background: "rgba(2, 6, 23, 0.03)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 900 }}>Templates</div>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Filter
                <select
                  value={selectedFilter}
                  onChange={(e) => setSelectedFilter(e.target.value)}
                  style={{ ...inputStyle, marginTop: 6 }}
                >
                  {TEMPLATE_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={beginNewTemplate}
                disabled={!isAdmin}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid rgba(168,85,247,0.35)`,
                  background: ui.colors.brandSoft,
                  color: ui.colors.text,
                  cursor: !isAdmin ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: !isAdmin ? 0.6 : 1,
                }}
              >
                New template
              </button>
            </div>

            <div style={{ maxHeight: "65vh", overflow: "auto", display: "grid", gap: 1, background: ui.colors.border }}>
              {filteredTemplates.length === 0 ? (
                <div style={{ padding: 12, background: ui.colors.cardBg, color: ui.colors.muted }}>
                  No templates match this filter.
                </div>
              ) : (
                filteredTemplates.map((template) => {
                  const isSelected = selectedTemplateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId(template.id);
                        setError("");
                        setSuccessMessage("");
                      }}
                      style={{
                        textAlign: "left",
                        padding: 12,
                        border: 0,
                        background: isSelected ? "rgba(168,85,247,0.12)" : ui.colors.cardBg,
                        cursor: "pointer",
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 900, color: ui.colors.text }}>{template.name}</div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: template.is_active ? ui.colors.text : ui.colors.muted,
                          }}
                        >
                          {template.is_active ? "Active" : "Inactive"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: ui.colors.muted, textTransform: "capitalize" }}>
                        {template.template_type}
                      </div>
                      <div style={{ fontSize: 12, color: ui.colors.text }}>
                        {formatTemplateScope(template)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <form
            onSubmit={saveTemplate}
            style={{
              border: `1px solid ${ui.colors.border}`,
              borderRadius: 12,
              background: ui.colors.cardBg,
              padding: 16,
              display: "grid",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>
                  {isNewTemplate ? "New template" : draft.name || "Template editor"}
                </div>
                <div style={ui.text.subtitle}>
                  {isAdmin
                    ? "Create, edit, and deactivate appointment email templates."
                    : "Managers can view templates but cannot edit them."}
                </div>
              </div>
              {!isNewTemplate ? (
                <div style={{ fontSize: 12, fontWeight: 800, color: draft.is_active ? ui.colors.text : ui.colors.muted }}>
                  {draft.is_active ? "Active" : "Inactive"}
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Name
                <input
                  value={draft.name}
                  onChange={(e) => updateDraft("name", e.target.value)}
                  style={{ ...inputStyle, marginTop: 6 }}
                  readOnly={!isAdmin}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Template type
                <select
                  value={draft.template_type}
                  onChange={(e) => updateDraft("template_type", e.target.value)}
                  style={{ ...inputStyle, marginTop: 6 }}
                  disabled={!isAdmin}
                >
                  {EDITOR_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Appointment type scope
                <select
                  value={draft.appointment_type_id}
                  onChange={(e) => updateDraft("appointment_type_id", e.target.value)}
                  style={{ ...inputStyle, marginTop: 6 }}
                  disabled={!isAdmin}
                >
                  <option value="">General / default</option>
                  {appointmentTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Active
                <select
                  value={draft.is_active ? "active" : "inactive"}
                  onChange={(e) => updateDraft("is_active", e.target.value === "active")}
                  style={{ ...inputStyle, marginTop: 6 }}
                  disabled={!isAdmin}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>

            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Subject
              <input
                value={draft.subject}
                onChange={(e) => updateDraft("subject", e.target.value)}
                style={{ ...inputStyle, marginTop: 6 }}
                readOnly={!isAdmin}
              />
            </label>

            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Body text
              <textarea
                rows={12}
                value={draft.body_text}
                onChange={(e) => updateDraft("body_text", e.target.value)}
                style={{ ...inputStyle, marginTop: 6, resize: "vertical" }}
                readOnly={!isAdmin}
              />
            </label>

            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Body HTML (optional)
              <textarea
                rows={8}
                value={draft.body_html}
                onChange={(e) => updateDraft("body_html", e.target.value)}
                style={{ ...inputStyle, marginTop: 6, resize: "vertical" }}
                readOnly={!isAdmin}
              />
            </label>

            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${ui.colors.border}`,
                background: "rgba(2, 6, 23, 0.02)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900 }}>Supported placeholders</div>
              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {PLACEHOLDERS.map((placeholder) => (
                  <div key={placeholder} style={{ color: ui.colors.text }}>
                    {placeholder}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${ui.colors.border}`,
                background: "rgba(2, 6, 23, 0.02)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 900 }}>Preview</div>
              <div style={{ marginTop: 10, fontWeight: 800 }}>{previewSubject}</div>
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 10,
                  background: ui.colors.cardBg,
                  border: `1px solid ${ui.colors.border}`,
                  whiteSpace: "pre-wrap",
                }}
              >
                {previewBody}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={resetChanges}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid ${ui.colors.border}`,
                  background: ui.colors.cardBg,
                  color: ui.colors.text,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Cancel / reset
              </button>

              {!isNewTemplate ? (
                <button
                  type="button"
                  onClick={deactivateTemplate}
                  disabled={!isAdmin || saving || !draft.is_active}
                  style={{
                    padding: "9px 12px",
                    borderRadius: ui.radius.md,
                    border: "1px solid rgba(239,68,68,0.35)",
                    background: "rgba(239,68,68,0.12)",
                    color: ui.colors.text,
                    cursor: !isAdmin || saving || !draft.is_active ? "not-allowed" : "pointer",
                    fontWeight: 900,
                    opacity: !isAdmin || saving || !draft.is_active ? 0.6 : 1,
                  }}
                >
                  Deactivate
                </button>
              ) : null}

              <button
                type="submit"
                disabled={!isAdmin || saving}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: "1px solid rgba(168,85,247,0.35)",
                  background: ui.colors.brandSoft,
                  color: ui.colors.text,
                  cursor: !isAdmin || saving ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: !isAdmin || saving ? 0.6 : 1,
                }}
              >
                {saving ? "Saving..." : isNewTemplate ? "Create template" : "Save template"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
