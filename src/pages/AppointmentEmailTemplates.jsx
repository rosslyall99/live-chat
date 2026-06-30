import React from "react";
import { ui } from "../ui/tokens";
import { supabase } from "../supabaseClient";
import { renderAppointmentEmailPreviewHtml } from "../utils/appointmentEmailPreview";
import "./AppointmentTypesAdmin.css";

const SAMPLE_VALUES = {
  customer_name: "Test Customer",
  appointment_type: "Hire Measurement",
  appointment_date: "Friday, 20 June 2026",
  appointment_time: "12:00",
  site_name: "Duke Street",
  area_name: "Area 1",
  staff_name: "Ross",
};

const TEMPLATE_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

const EDITOR_KIND_OPTIONS = [
  { value: "confirmation", label: "Confirmation" },
  { value: "reminder", label: "Reminder" },
  { value: "feedback", label: "Feedback" },
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

const GENERAL_CATEGORY_VALUE = "__general__";
const GENERAL_SCOPE_LABEL = "General / Default";

function applyPlaceholders(template, replacements) {
  let result = String(template || "");

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

function textToHtml(value) {
  return `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${String(
    value || "",
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")}</div>`;
}

function sanitizePreviewHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
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
  const [appointmentCategories, setAppointmentCategories] = React.useState([]);
  const [appointmentTypes, setAppointmentTypes] = React.useState([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = React.useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = React.useState("active");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [draft, setDraft] = React.useState(blankDraft);
  const [draftCategoryId, setDraftCategoryId] = React.useState(GENERAL_CATEGORY_VALUE);
  const [activeEditorField, setActiveEditorField] = React.useState("body_html");
  const subjectInputRef = React.useRef(null);
  const bodyTextRef = React.useRef(null);
  const bodyHtmlRef = React.useRef(null);

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
    [],
  );

  const appointmentCategoriesById = React.useMemo(() => {
    const map = new Map();
    for (const category of appointmentCategories) {
      map.set(category.id, category);
    }
    return map;
  }, [appointmentCategories]);

  const appointmentTypeOptions = React.useMemo(() => {
    const map = new Map();

    for (const item of appointmentTypes) {
      map.set(item.id, {
        id: item.id,
        name: item.name,
        category_id: item.category_id || "",
      });
    }

    for (const template of templates) {
      if (template.appointment_type_id && template.appointment_type_name) {
        map.set(template.appointment_type_id, {
          id: template.appointment_type_id,
          name: template.appointment_type_name,
          category_id:
            appointmentTypes.find((item) => item.id === template.appointment_type_id)
              ?.category_id || "",
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [appointmentTypes, templates]);

  const appointmentTypesById = React.useMemo(() => {
    const map = new Map();
    for (const item of appointmentTypeOptions) {
      map.set(item.id, item);
    }
    return map;
  }, [appointmentTypeOptions]);

  const categoryFilterOptions = React.useMemo(() => {
    return [
      { value: "all", label: "All categories" },
      { value: GENERAL_CATEGORY_VALUE, label: GENERAL_SCOPE_LABEL },
      ...appointmentCategories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ];
  }, [appointmentCategories]);

  const filteredAppointmentTypeOptions = React.useMemo(() => {
    if (draftCategoryId === GENERAL_CATEGORY_VALUE) return [];
    return appointmentTypeOptions.filter(
      (item) => item.category_id === draftCategoryId,
    );
  }, [appointmentTypeOptions, draftCategoryId]);

  const filteredTemplates = React.useMemo(() => {
    const statusFiltered =
      selectedStatusFilter === "all"
        ? templates
        : templates.filter((item) =>
            selectedStatusFilter === "active" ? item.is_active : !item.is_active,
          );

    if (selectedCategoryFilter === "all") return statusFiltered;
    if (selectedCategoryFilter === GENERAL_CATEGORY_VALUE) {
      return statusFiltered.filter((item) => !item.appointment_type_id);
    }

    return statusFiltered.filter((item) => {
      const type = appointmentTypesById.get(item.appointment_type_id);
      return type?.category_id === selectedCategoryFilter;
    });
  }, [
    appointmentTypesById,
    selectedCategoryFilter,
    selectedStatusFilter,
    templates,
  ]);

  const selectedTemplate = React.useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );

  const previewSubject = React.useMemo(
    () => applyPlaceholders(draft.subject, SAMPLE_VALUES) || "No subject set",
    [draft.subject],
  );

  const previewBody = React.useMemo(
    () =>
      applyPlaceholders(draft.body_text, SAMPLE_VALUES) || "No body text set",
    [draft.body_text],
  );

  const previewHtml = React.useMemo(() => {
    const resolvedBodyHtml = draft.body_html
      ? applyPlaceholders(draft.body_html, SAMPLE_VALUES)
      : textToHtml(previewBody);
    return sanitizePreviewHtml(
      renderAppointmentEmailPreviewHtml({
        subject: previewSubject,
        bodyText: previewBody,
        bodyHtml: resolvedBodyHtml,
        details: {
          appointmentType: SAMPLE_VALUES.appointment_type,
          appointmentDate: SAMPLE_VALUES.appointment_date,
          appointmentTime: SAMPLE_VALUES.appointment_time,
          siteName: SAMPLE_VALUES.site_name,
          areaName: SAMPLE_VALUES.area_name,
          staffName: SAMPLE_VALUES.staff_name,
        },
      }),
    );
  }, [draft.body_html, previewBody, previewSubject]);

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
      if (!profile?.is_active)
        throw new Error("Your staff profile is inactive or missing.");

      const nextRole = String(profile.role || "").toLowerCase();
      setRole(nextRole);

      if (!["admin", "manager"].includes(nextRole)) {
        setTemplates([]);
        setAppointmentCategories([]);
        setAppointmentTypes([]);
        setSelectedTemplateId("");
        setDraft(blankDraft());
        return;
      }

      const [templatesRes, categoriesRes, typesRes] = await Promise.all([
        supabase.rpc("get_appointment_email_templates_staff"),
        supabase
          .from("appointment_categories")
          .select("id, name, sort_order, is_active")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("appointment_types")
          .select("id, name, category_id, is_active, sort_order")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (typesRes.error) throw typesRes.error;

      const nextTemplates = templatesRes.data || [];
      setTemplates(nextTemplates);
      setAppointmentCategories(categoriesRes.data || []);
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
      setAppointmentCategories([]);
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
      setDraftCategoryId(GENERAL_CATEGORY_VALUE);
      return;
    }

    setDraft(toDraft(selectedTemplate));
    setDraftCategoryId(
      selectedTemplate?.appointment_type_id
        ? appointmentTypesById.get(selectedTemplate.appointment_type_id)
            ?.category_id || GENERAL_CATEGORY_VALUE
        : GENERAL_CATEGORY_VALUE,
    );
  }, [appointmentTypesById, selectedTemplate, selectedTemplateId]);

  React.useEffect(() => {
    if (selectedTemplateId === "__new__") return;
    if (selectedTemplateId && filteredTemplates.some((item) => item.id === selectedTemplateId))
      return;
    setSelectedTemplateId(filteredTemplates[0]?.id || "");
  }, [filteredTemplates, selectedTemplateId]);

  function updateDraft(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function updateDraftCategory(nextCategoryId) {
    setDraftCategoryId(nextCategoryId);
    if (nextCategoryId === GENERAL_CATEGORY_VALUE) {
      updateDraft("appointment_type_id", "");
      return;
    }

    const currentType = appointmentTypesById.get(draft.appointment_type_id);
    if (currentType?.category_id !== nextCategoryId) {
      updateDraft("appointment_type_id", "");
    }
  }

  function registerEditorFocus(field) {
    setActiveEditorField(field);
  }

  function insertPlaceholder(placeholder) {
    const fallbackField = bodyHtmlRef.current
      ? "body_html"
      : bodyTextRef.current
        ? "body_text"
        : "subject";
    const targetField = activeEditorField || fallbackField;
    const refs = {
      subject: subjectInputRef,
      body_text: bodyTextRef,
      body_html: bodyHtmlRef,
    };
    const targetRef = refs[targetField];
    const element = targetRef?.current;

    if (!element) {
      updateDraft(targetField, `${draft[targetField] || ""}${placeholder}`);
      return;
    }

    const start = element.selectionStart ?? String(draft[targetField] || "").length;
    const end = element.selectionEnd ?? start;
    const currentValue = String(draft[targetField] || "");
    const nextValue =
      currentValue.slice(0, start) + placeholder + currentValue.slice(end);

    updateDraft(targetField, nextValue);
    setActiveEditorField(targetField);

    window.requestAnimationFrame(() => {
      element.focus();
      const nextCaret = start + placeholder.length;
      element.setSelectionRange?.(nextCaret, nextCaret);
    });
  }

  function beginNewTemplate() {
    setSelectedTemplateId("__new__");
    setDraft(blankDraft());
    setDraftCategoryId(GENERAL_CATEGORY_VALUE);
    setError("");
    setSuccessMessage("");
  }

  function resetChanges() {
    setError("");
    setSuccessMessage("");
    setDraft(
      selectedTemplateId === "__new__"
        ? blankDraft()
        : toDraft(selectedTemplate),
    );
    setDraftCategoryId(
      selectedTemplate?.appointment_type_id
        ? appointmentTypesById.get(selectedTemplate.appointment_type_id)
            ?.category_id || GENERAL_CATEGORY_VALUE
        : GENERAL_CATEGORY_VALUE,
    );
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

    if (
      draftCategoryId !== GENERAL_CATEGORY_VALUE &&
      !draft.appointment_type_id
    ) {
      setError("Choose an appointment type for the selected category.");
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
      setSuccessMessage(
        isNewTemplate ? "Template created." : "Template saved.",
      );
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
      const { error: rpcError } = await supabase.rpc(
        "deactivate_appointment_email_template_staff",
        {
          p_template_id: draft.id,
        },
      );

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
    <div
      className="appointment-types-admin appointment-email-admin-page"
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
      <div className="appointment-admin-header">
        <h2 style={{ margin: 0 }}>Appointment Emails</h2>
        <div style={ui.text.subtitle}>
          Manage reusable appointment confirmation, reminder, and feedback
          templates.
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 16 }}>Loading templates...</div>
      ) : null}

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
          className="appointment-admin-layout appointment-email-admin-layout"
          style={{ marginTop: 18 }}
        >
          <section className="appointment-admin-column">
            <div className="appointment-admin-selector-card appointment-email-list-card">
              <div
                style={{
                  padding: "0 0 12px",
                  borderBottom: `1px solid ${ui.colors.border}`,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 900 }}>Templates</div>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Category
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    style={{ ...inputStyle, marginTop: 6 }}
                  >
                    {categoryFilterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Status
                  <select
                    value={selectedStatusFilter}
                    onChange={(e) => setSelectedStatusFilter(e.target.value)}
                    style={{ ...inputStyle, marginTop: 6 }}
                  >
                    {TEMPLATE_STATUS_OPTIONS.map((option) => (
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

              <div className="appointment-admin-scroll appointment-email-template-list">
                {filteredTemplates.length === 0 ? (
                  <div className="appointment-email-template-empty">
                    No templates match this filter.
                  </div>
                ) : (
                  filteredTemplates.map((template) => {
                    const isSelected = selectedTemplateId === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        className={`appointment-email-template-card ${
                          isSelected
                            ? "appointment-email-template-card--selected"
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedTemplateId(template.id);
                          setError("");
                          setSuccessMessage("");
                        }}
                      >
                        <div className="appointment-email-template-card-header">
                          <div className="appointment-email-template-card-title">
                            {template.name}
                          </div>
                          <div className="appointment-email-template-status">
                            {template.is_active ? "Active" : "Inactive"}
                          </div>
                        </div>
                        <div className="appointment-email-template-meta">
                          <span>{template.template_type}</span>
                          <span>{formatTemplateScope(template)}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          <section className="appointment-admin-column">
            <form
              onSubmit={saveTemplate}
              className="appointment-admin-detail-card appointment-email-editor-card appointment-admin-scroll"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {isNewTemplate
                      ? "New template"
                      : draft.name || "Template editor"}
                  </div>
                </div>
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
                    onChange={(e) =>
                      updateDraft("template_type", e.target.value)
                    }
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
                  Category
                  <select
                    value={draftCategoryId}
                    onChange={(e) => updateDraftCategory(e.target.value)}
                    style={{ ...inputStyle, marginTop: 6 }}
                    disabled={!isAdmin}
                  >
                    <option value={GENERAL_CATEGORY_VALUE}>
                      {GENERAL_SCOPE_LABEL}
                    </option>
                    {appointmentCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Appointment type scope
                  <select
                    value={draft.appointment_type_id}
                    onChange={(e) =>
                      updateDraft("appointment_type_id", e.target.value)
                    }
                    style={{ ...inputStyle, marginTop: 6 }}
                    disabled={!isAdmin}
                  >
                    <option value="">
                      {draftCategoryId === GENERAL_CATEGORY_VALUE
                        ? GENERAL_SCOPE_LABEL
                        : "Select appointment type"}
                    </option>
                    {filteredAppointmentTypeOptions.map((option) => (
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
                    onChange={(e) =>
                      updateDraft("is_active", e.target.value === "active")
                    }
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
                  ref={subjectInputRef}
                  value={draft.subject}
                  onChange={(e) => updateDraft("subject", e.target.value)}
                  onFocus={() => registerEditorFocus("subject")}
                  style={{ ...inputStyle, marginTop: 6 }}
                  readOnly={!isAdmin}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Body text
                <textarea
                  ref={bodyTextRef}
                  rows={12}
                  value={draft.body_text}
                  onChange={(e) => updateDraft("body_text", e.target.value)}
                  onFocus={() => registerEditorFocus("body_text")}
                  style={{ ...inputStyle, marginTop: 6, resize: "vertical" }}
                  readOnly={!isAdmin}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 700 }}>
                Body HTML (optional)
                <textarea
                  ref={bodyHtmlRef}
                  rows={8}
                  value={draft.body_html}
                  onChange={(e) => updateDraft("body_html", e.target.value)}
                  onFocus={() => registerEditorFocus("body_html")}
                  style={{ ...inputStyle, marginTop: 6, resize: "vertical" }}
                  readOnly={!isAdmin}
                />
              </label>

              <div className="appointment-email-placeholder-card">
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                  }}
                >
                  Supported placeholders
                </div>
                <div className="appointment-email-placeholder-list">
                  {PLACEHOLDERS.map((placeholder) => (
                    <button
                      key={placeholder}
                      type="button"
                      className="appointment-email-placeholder-chip"
                      onClick={() => insertPlaceholder(placeholder)}
                      disabled={!isAdmin}
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>

              <div className="appointment-email-preview-card">
                <div style={{ fontSize: 14, fontWeight: 900 }}>Preview</div>
                <div style={{ marginTop: 10, fontWeight: 800 }}>
                  {previewSubject}
                </div>
                <div className="appointment-email-preview-grid">
                  <div className="appointment-email-preview-pane">
                    <div className="appointment-email-preview-pane__label">
                      HTML preview
                    </div>
                    <iframe
                      title="Appointment email HTML preview"
                      className="appointment-email-preview-frame"
                      sandbox=""
                      srcDoc={previewHtml}
                    />
                  </div>
                  <div className="appointment-email-preview-pane">
                    <div className="appointment-email-preview-pane__label">
                      Plain text fallback
                    </div>
                    <div className="appointment-email-preview-text">
                      {previewBody}
                    </div>
                  </div>
                </div>
              </div>

              <div className="appointment-email-editor-actions">
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
                      cursor:
                        !isAdmin || saving || !draft.is_active
                          ? "not-allowed"
                          : "pointer",
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
                  {saving
                    ? "Saving..."
                    : isNewTemplate
                      ? "Create template"
                      : "Save template"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
