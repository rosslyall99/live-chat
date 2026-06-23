import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { ui } from "../ui/tokens";
import "./AppointmentTypesAdmin.css";

const DEFAULT_DURATION_MINUTES = 30;
const FALLBACK_COLOR = "#94a3b8";
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CATEGORY_CODES = {
  hire: "hire",
  purchase: "purchase",
  retailCollection: "retail_collection",
  other: "other",
};

// Keep this aligned with the current booking wizard in Appointments.jsx until the
// wizard is fully migrated to database-driven categories/types.
const WIZARD_TYPE_RULES = [
  {
    code: "hire_measurement",
    rawNames: ["Hire Measurement"],
    categoryName: "Hire",
    editorName: "Hire Measurement",
  },
  {
    code: "hire_remeasure",
    rawNames: ["Hire Remeasure", "Remeasure"],
    categoryName: "Hire",
    editorName: "Hire Remeasure",
  },
  {
    code: "hire_collection",
    rawNames: ["Collection", "Party Collection Try On", "Hire Collection"],
    categoryName: "Hire",
    editorName: "Collection",
  },
  {
    code: "hire_style_fit",
    rawNames: ["Style & Fit"],
    categoryName: "Hire",
    editorName: "Style & Fit",
  },
  {
    code: "hire_full_try_on",
    rawNames: ["Full Try On"],
    categoryName: "Hire",
    editorName: "Full Try On",
  },
  {
    code: "retail_purchase_full_kilt_package",
    rawNames: ["Retail Purchase - Full Kilt Package"],
    categoryName: "Purchase",
    editorName: "Full Kilt Package",
  },
  {
    code: "retail_purchase_kilt_only",
    rawNames: ["Retail Purchase - Kilt Only"],
    categoryName: "Purchase",
    editorName: "Kilt Only",
  },
  {
    code: "retail_purchase_trousers",
    rawNames: ["Retail Purchase - Trousers"],
    categoryName: "Purchase",
    editorName: "Trousers",
  },
  {
    code: "retail_purchase_jacket_waistcoat",
    rawNames: ["Retail Purchase - Jacket & Waistcoat"],
    categoryName: "Purchase",
    editorName: "Jacket & Waistcoat",
  },
  {
    code: "retail_purchase_accessories",
    rawNames: ["Retail Purchase - Accessories"],
    categoryName: "Purchase",
    editorName: "Accessories",
  },
  {
    code: "retail_collection_full_kilt_outfit",
    rawNames: ["Retail Collection - Full Kilt Outfit"],
    categoryName: "Retail Collection",
    editorName: "Full Kilt Outfit",
  },
  {
    code: "retail_collection_kilt_only",
    rawNames: ["Retail Collection - Kilt Only"],
    categoryName: "Retail Collection",
    editorName: "Kilt Only",
  },
  {
    code: "retail_collection_trousers",
    rawNames: ["Retail Collection - Trousers"],
    categoryName: "Retail Collection",
    editorName: "Trousers",
  },
  {
    code: "retail_collection_jacket_waistcoat",
    rawNames: ["Retail Collection - Jacket & Waistcoat"],
    categoryName: "Retail Collection",
    editorName: "Jacket & Waistcoat",
  },
  {
    code: "retail_collection_accessories",
    rawNames: ["Retail Collection - Accessories"],
    categoryName: "Retail Collection",
    editorName: "Accessories",
  },
  {
    code: "alteration_kilt",
    rawNames: ["Alteration - Kilt"],
    categoryName: "Other",
    editorName: "Alteration Kilt",
  },
  {
    code: "alteration_trews",
    rawNames: ["Alteration - Trews"],
    categoryName: "Other",
    editorName: "Alteration Trews",
  },
  {
    code: "custom_appointment",
    rawNames: ["Custom Appointment"],
    categoryName: "Other",
    editorName: "Custom Appointment",
  },
];

const RULE_BY_RAW_NAME = new Map(
  WIZARD_TYPE_RULES.flatMap((rule) =>
    rule.rawNames.map((rawName) => [rawName.trim().toLowerCase(), rule]),
  ),
);

const RULE_BY_CODE = new Map(
  WIZARD_TYPE_RULES.map((rule) => [
    String(rule.code || "")
      .trim()
      .toLowerCase(),
    rule,
  ]),
);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeColor(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function resolvePickerColor(value) {
  const normalized = normalizeColor(value);
  return HEX_COLOR_RE.test(normalized) ? normalized : FALLBACK_COLOR;
}

function nextSortOrder(items) {
  const values = (items || [])
    .map((item) => Number(item.sort_order))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return 100;
  return Math.max(...values) + 10;
}

function blankCategoryDraft(sortOrder = 100) {
  return {
    id: "",
    name: "",
    sort_order: sortOrder,
    is_active: true,
  };
}

function blankTypeDraft(sortOrder = 100, categoryId = "") {
  return {
    id: "",
    category_id: categoryId,
    name: "",
    duration_minutes: DEFAULT_DURATION_MINUTES,
    color: "",
    text_color: "",
    is_active: true,
    sort_order: sortOrder,
    description: "",
  };
}

function toCategoryDraft(category) {
  if (!category) return blankCategoryDraft();
  return {
    id: category.id || "",
    name: category.name || "",
    sort_order: Number(category.sort_order || 100),
    is_active: Boolean(category.is_active),
  };
}

function toTypeDraft(type) {
  if (!type) return blankTypeDraft();
  return {
    id: type.id || "",
    category_id: type.category_id || "",
    name: type.editor_name || type.name || "",
    duration_minutes: Number(type.duration_minutes || DEFAULT_DURATION_MINUTES),
    color: type.color || "",
    text_color: type.text_color || "",
    is_active: Boolean(type.is_active),
    sort_order: Number(type.sort_order || 100),
    description: type.description || "",
  };
}

function composeStoredTypeName(editorName, category) {
  const trimmed = String(editorName || "").trim();
  if (!trimmed) return "";

  const categoryCode = normalizeCode(category?.code);
  const categoryName = String(category?.name || "").trim();

  if (categoryCode === CATEGORY_CODES.purchase || categoryName === "Purchase") {
    return `Retail Purchase - ${trimmed}`;
  }

  if (
    categoryCode === CATEGORY_CODES.retailCollection ||
    categoryName === "Retail Collection" ||
    categoryName === "Collection"
  ) {
    return `Retail Collection - ${trimmed}`;
  }

  if (categoryCode === CATEGORY_CODES.other || categoryName === "Other") {
    const normalized = normalizeText(trimmed);
    if (normalized === "alteration kilt") return "Alteration - Kilt";
    if (
      normalized === "alteration trews" ||
      normalized === "alteration trews/trousers"
    ) {
      return "Alteration - Trews";
    }
    return trimmed;
  }

  if (categoryCode === CATEGORY_CODES.hire || categoryName === "Hire") {
    const normalized = normalizeText(trimmed);
    if (normalized === "hire remeasure" || normalized === "remeasure")
      return "Hire Remeasure";
    if (normalized === "collection") return "Collection";
    return trimmed;
  }

  return trimmed;
}

function resolveWizardTypeRule(category, editorName, existingCode) {
  const codeRule = RULE_BY_CODE.get(normalizeCode(existingCode));
  if (codeRule) return codeRule;

  const storedName = composeStoredTypeName(editorName, category);
  return (
    RULE_BY_RAW_NAME.get(normalizeText(storedName)) ||
    RULE_BY_RAW_NAME.get(normalizeText(editorName)) ||
    null
  );
}

function deriveTypeCode(category, editorName, existingCode) {
  const rule = resolveWizardTypeRule(category, editorName, existingCode);
  if (rule?.code) return rule.code;

  const normalizedExistingCode = normalizeCode(existingCode);
  return normalizedExistingCode || null;
}

function buildUiType(row, categoriesById) {
  const rule =
    RULE_BY_CODE.get(normalizeCode(row.code)) ||
    RULE_BY_RAW_NAME.get(normalizeText(row.name)) ||
    null;
  const category = categoriesById.get(row.category_id) || null;
  const categoryName = category?.name || rule?.categoryName || "";

  return {
    ...row,
    category_name: categoryName,
    editor_name: rule?.editorName || row.name,
  };
}

function reorderItems(items, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return items;

  const next = [...items];
  const fromIndex = next.findIndex((item) => item.id === sourceId);
  const toIndex = next.findIndex((item) => item.id === targetId);

  if (fromIndex === -1 || toIndex === -1) return items;

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function reorderVisibleItemsInCollection(items, sourceId, targetId, predicate) {
  const visibleItems = items.filter(predicate);
  const reorderedVisibleItems = reorderItems(visibleItems, sourceId, targetId);

  if (reorderedVisibleItems === visibleItems) return items;

  let visibleIndex = 0;
  return items.map((item) => {
    if (!predicate(item)) return item;
    const nextItem = reorderedVisibleItems[visibleIndex];
    visibleIndex += 1;
    return nextItem;
  });
}

function RowCard({
  children,
  isSelected,
  isDragging = false,
  isDropTarget = false,
  onClick,
  ...props
}) {
  const transform = isDragging
    ? "translateY(-1px)"
    : isDropTarget
      ? "translateX(4px)"
      : "translateX(0)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "9px 12px",
        border: isSelected
          ? "1px solid rgba(168,85,247,0.34)"
          : `1px solid ${ui.colors.border}`,
        borderRadius: 12,
        textAlign: "left",
        background: isSelected ? "rgba(168,85,247,0.06)" : ui.colors.cardBg,
        cursor: "default",
        color: ui.colors.text,
        boxShadow: isDragging
          ? "0 12px 24px rgba(15, 23, 42, 0.16)"
          : isDropTarget
            ? "0 8px 18px rgba(15, 23, 42, 0.08)"
            : isSelected
              ? "0 0 0 3px rgba(168,85,247,0.08)"
              : "none",
        transform,
        opacity: isDragging ? 0.96 : 1,
        willChange: "transform, box-shadow",
        transition:
          "background-color 140ms ease, border-color 140ms ease, box-shadow 180ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease",
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export default function AppointmentTypesAdmin() {
  const [role, setRole] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [savingCategory, setSavingCategory] = React.useState(false);
  const [savingType, setSavingType] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [categories, setCategories] = React.useState([]);
  const [appointmentTypes, setAppointmentTypes] = React.useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState("");
  const [selectedTypeId, setSelectedTypeId] = React.useState("");
  const [categoryDraft, setCategoryDraft] =
    React.useState(blankCategoryDraft());
  const [typeDraft, setTypeDraft] = React.useState(blankTypeDraft());
  const [dragCategoryId, setDragCategoryId] = React.useState("");
  const [dragTypeId, setDragTypeId] = React.useState("");
  const [dragOverCategoryId, setDragOverCategoryId] = React.useState("");
  const [dragOverTypeId, setDragOverTypeId] = React.useState("");
  const toastTimerRef = React.useRef(null);

  const isAdmin = role === "admin";
  const isNewCategory = selectedCategoryId === "__new__";
  const isNewType = selectedTypeId === "__new__";

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

  const cardStyle = React.useMemo(
    () => ({
      border: `1px solid ${ui.colors.border}`,
      borderRadius: 12,
      background: ui.colors.cardBg,
      overflow: "hidden",
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

    const dismissAfter = timeoutMs ?? (type === "error" ? 9000 : 5000);
    if (dismissAfter > 0) {
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, dismissAfter);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      document.body.style.cursor = "";
    };
  }, []);

  const visibleCategories = React.useMemo(() => categories, [categories]);

  const categoriesById = React.useMemo(() => {
    const map = new Map();
    for (const category of categories) {
      map.set(category.id, category);
    }
    return map;
  }, [categories]);

  const uiTypes = React.useMemo(
    () => appointmentTypes.map((type) => buildUiType(type, categoriesById)),
    [appointmentTypes, categoriesById],
  );

  const selectedCategory = React.useMemo(
    () =>
      visibleCategories.find((item) => item.id === selectedCategoryId) || null,
    [selectedCategoryId, visibleCategories],
  );

  const visibleTypes = React.useMemo(() => {
    if (!selectedCategory) return [];
    return uiTypes.filter((type) => type.category_id === selectedCategory.id);
  }, [selectedCategory, uiTypes]);

  const selectedType = React.useMemo(
    () => visibleTypes.find((item) => item.id === selectedTypeId) || null,
    [selectedTypeId, visibleTypes],
  );

  const loadAll = React.useCallback(async () => {
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
      if (!profile?.is_active)
        throw new Error("Your staff profile is inactive or missing.");

      const nextRole = String(profile.role || "").toLowerCase();
      setRole(nextRole);

      if (nextRole !== "admin") {
        setCategories([]);
        setAppointmentTypes([]);
        setSelectedCategoryId("");
        setSelectedTypeId("");
        return;
      }

      const [categoriesRes, typesRes] = await Promise.all([
        supabase
          .from("appointment_categories")
          .select(
            "id, name, code, sort_order, is_active, created_at, updated_at",
          )
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("appointment_types")
          .select(
            "id, name, code, category_id, duration_minutes, color, text_color, sort_order, is_active, description, created_at, updated_at",
          )
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (typesRes.error) throw typesRes.error;

      setCategories(categoriesRes.data || []);
      setAppointmentTypes(typesRes.data || []);
    } catch (err) {
      console.error("appointment types admin: load failed", err);
      showToast(
        "error",
        err?.message || "Could not load appointment type settings.",
      );
      setCategories([]);
      setAppointmentTypes([]);
      setSelectedCategoryId("");
      setSelectedTypeId("");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  function getCategoryDraftForSelection(
    nextSelectedCategoryId = selectedCategoryId,
  ) {
    if (nextSelectedCategoryId === "__new__") {
      return blankCategoryDraft(nextSortOrder(visibleCategories));
    }

    const nextSelectedCategory =
      visibleCategories.find((item) => item.id === nextSelectedCategoryId) ||
      null;

    return nextSelectedCategory
      ? toCategoryDraft(nextSelectedCategory)
      : blankCategoryDraft();
  }

  function getTypeDraftForSelection(nextSelectedTypeId = selectedTypeId) {
    if (nextSelectedTypeId === "__new__") {
      return blankTypeDraft(
        nextSortOrder(visibleTypes),
        selectedCategory?.id || "",
      );
    }

    const nextSelectedType =
      visibleTypes.find((item) => item.id === nextSelectedTypeId) || null;

    if (nextSelectedType) {
      return toTypeDraft(nextSelectedType);
    }

    const fallbackSortOrder = visibleTypes.length
      ? nextSortOrder(visibleTypes)
      : nextSortOrder(appointmentTypes);

    return blankTypeDraft(fallbackSortOrder, selectedCategory?.id || "");
  }

  React.useEffect(() => {
    setCategoryDraft(getCategoryDraftForSelection());
  }, [selectedCategoryId, visibleCategories]);

  React.useEffect(() => {
    setTypeDraft(getTypeDraftForSelection());
  }, [appointmentTypes, selectedCategory, selectedTypeId, visibleTypes]);

  function beginNewCategory() {
    setSelectedCategoryId("__new__");
    setCategoryDraft(getCategoryDraftForSelection("__new__"));
  }

  function beginNewType() {
    setSelectedTypeId("__new__");
    setTypeDraft(getTypeDraftForSelection("__new__"));
  }

  function startDrag(setDragId, setDragOverId, id, event) {
    event.dataTransfer.effectAllowed = "move";
    try {
      event.dataTransfer.dropEffect = "move";
      event.dataTransfer.setData("text/plain", id);
    } catch {}
    document.body.style.cursor = "default";
    setDragId(id);
    setDragOverId("");
  }

  function endDrag(setDragId, setDragOverId) {
    document.body.style.cursor = "";
    setDragId("");
    setDragOverId("");
  }

  function reorderVisibleTypesDuringDrag(sourceId, targetId) {
    if (!selectedCategory?.id) return;

    setAppointmentTypes((current) =>
      reorderVisibleItemsInCollection(
        current,
        sourceId,
        targetId,
        (item) => item.category_id === selectedCategory.id,
      ),
    );
  }

  function reorderCategoriesDuringDrag(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    setCategories((current) => reorderItems(current, sourceId, targetId));
  }

  async function persistCategoryOrder(nextCategories) {
    const normalized = nextCategories.map((item, index) => ({
      ...item,
      sort_order: (index + 1) * 10,
    }));

    const previousCategories = categories;
    const normalizedMap = new Map(normalized.map((item) => [item.id, item]));

    setCategories((current) => {
      const untouched = current.filter((item) => !normalizedMap.has(item.id));
      return [...normalized, ...untouched];
    });

    try {
      const updates = normalized.map((item) =>
        supabase
          .from("appointment_categories")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id),
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    } catch (err) {
      console.error("appointment types admin: category reorder failed", err);
      setCategories(previousCategories);
      showToast("error", err?.message || "Could not save the category order.");
      await loadAll();
    }
  }

  async function persistTypeOrder(nextVisibleTypes) {
    const visibleIds = new Set(nextVisibleTypes.map((item) => item.id));
    const nextVisibleMap = new Map(
      nextVisibleTypes.map((item, index) => [
        item.id,
        { ...item, sort_order: (index + 1) * 10 },
      ]),
    );

    const previousTypes = appointmentTypes;

    setAppointmentTypes((current) => {
      const reordered = [];
      let visibleIndex = 0;

      for (const item of current) {
        if (!visibleIds.has(item.id)) {
          reordered.push(item);
          continue;
        }

        reordered.push(nextVisibleTypes[visibleIndex]);
        visibleIndex += 1;
      }

      return reordered.map((item) => nextVisibleMap.get(item.id) || item);
    });

    try {
      const updates = Array.from(nextVisibleMap.values()).map((item) =>
        supabase
          .from("appointment_types")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id),
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    } catch (err) {
      console.error("appointment types admin: type reorder failed", err);
      setAppointmentTypes(previousTypes);
      showToast(
        "error",
        err?.message || "Could not save the appointment type order.",
      );
      await loadAll();
    }
  }

  function resetCategoryDraft() {
    setCategoryDraft(getCategoryDraftForSelection());
  }

  function discardTypeDraft(event) {
    event?.preventDefault();
    event?.stopPropagation();
    setSelectedTypeId("");
    setTypeDraft(blankTypeDraft());
    showToast("success", "Changes discarded.");
  }

  async function saveCategory(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("error", "Only admins can manage appointment categories.");
      return;
    }

    const name = categoryDraft.name.trim();
    if (!name) {
      showToast("error", "Category name is required.");
      return;
    }

    setSavingCategory(true);

    try {
      const payload = {
        name,
        sort_order: Number(
          categoryDraft.sort_order || nextSortOrder(visibleCategories),
        ),
        is_active: Boolean(categoryDraft.is_active),
      };

      const response = isNewCategory
        ? await supabase
            .from("appointment_categories")
            .insert(payload)
            .select("id")
            .single()
        : await supabase
            .from("appointment_categories")
            .update(payload)
            .eq("id", categoryDraft.id)
            .select("id")
            .single();

      if (response.error) throw response.error;

      await loadAll();
      if (response.data?.id) {
        setSelectedCategoryId(response.data.id);
      }
      showToast(
        "success",
        isNewCategory ? "Category created." : "Category saved.",
      );
    } catch (err) {
      console.error("appointment types admin: category save failed", err);
      showToast("error", err?.message || "Could not save the category.");
    } finally {
      setSavingCategory(false);
    }
  }

  async function saveType(event) {
    event.preventDefault();

    if (!isAdmin) {
      showToast("error", "Only admins can manage appointment types.");
      return;
    }

    const editorName = typeDraft.name.trim();
    const categoryId = String(typeDraft.category_id || "").trim();
    const durationMinutes = Number(typeDraft.duration_minutes);
    const category = categoriesById.get(categoryId) || null;
    const storedName = composeStoredTypeName(editorName, category);
    const selectedTypeRow =
      appointmentTypes.find((item) => item.id === typeDraft.id) || null;
    const typeCode = deriveTypeCode(
      category,
      editorName,
      selectedTypeRow?.code || "",
    );
    const color = normalizeColor(typeDraft.color);
    const textColor = normalizeColor(typeDraft.text_color);

    if (!editorName) {
      showToast("error", "Appointment type name is required.");
      return;
    }

    if (!categoryId) {
      showToast("error", "Choose a category for this appointment type.");
      return;
    }

    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 5 ||
      durationMinutes > 480
    ) {
      showToast(
        "error",
        "Default duration must be a whole number between 5 and 480 minutes.",
      );
      return;
    }

    if (color && !HEX_COLOR_RE.test(color)) {
      showToast("error", "Choose a valid colour.");
      return;
    }

    if (textColor && !HEX_COLOR_RE.test(textColor)) {
      showToast("error", "Choose a valid text colour.");
      return;
    }

    setSavingType(true);

    try {
      const payload = {
        code: typeCode,
        name: storedName,
        category_id: categoryId,
        duration_minutes: durationMinutes,
        color: color || null,
        text_color: textColor || null,
        sort_order: Number(typeDraft.sort_order || nextSortOrder(visibleTypes)),
        is_active: Boolean(typeDraft.is_active),
        description: typeDraft.description.trim() || null,
      };

      const response = isNewType
        ? await supabase
            .from("appointment_types")
            .insert(payload)
            .select("id")
            .single()
        : await supabase
            .from("appointment_types")
            .update(payload)
            .eq("id", typeDraft.id)
            .select("id")
            .single();

      if (response.error) throw response.error;

      await loadAll();
      setSelectedTypeId("");
      setTypeDraft(blankTypeDraft());
      showToast("success", "Appointment type saved.");
    } catch (err) {
      console.error("appointment types admin: type save failed", err);
      showToast(
        "error",
        err?.message || "Could not save the appointment type.",
      );
    } finally {
      setSavingType(false);
    }
  }

  async function toggleCategoryActive(nextIsActive) {
    if (!categoryDraft.id) return;

    setSavingCategory(true);

    try {
      const { error: updateError } = await supabase
        .from("appointment_categories")
        .update({ is_active: nextIsActive })
        .eq("id", categoryDraft.id);

      if (updateError) throw updateError;

      await loadAll();
      showToast(
        "success",
        nextIsActive ? "Category reactivated." : "Category deactivated.",
      );
    } catch (err) {
      console.error(
        "appointment types admin: category active toggle failed",
        err,
      );
      showToast(
        "error",
        err?.message || "Could not update the category status.",
      );
    } finally {
      setSavingCategory(false);
    }
  }

  async function toggleTypeActive(nextIsActive) {
    if (!typeDraft.id) return;

    setSavingType(true);

    try {
      const { error: updateError } = await supabase
        .from("appointment_types")
        .update({ is_active: nextIsActive })
        .eq("id", typeDraft.id);

      if (updateError) throw updateError;

      await loadAll();
      setSelectedTypeId("");
      setTypeDraft(blankTypeDraft());
      showToast(
        "success",
        nextIsActive
          ? "Appointment type reactivated."
          : "Appointment type deactivated.",
      );
    } catch (err) {
      console.error("appointment types admin: type active toggle failed", err);
      showToast(
        "error",
        err?.message || "Could not update the appointment type status.",
      );
    } finally {
      setSavingType(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}
      >
        Loading appointment types...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div
        style={{ width: "100%", color: ui.colors.text, fontFamily: ui.font.ui }}
      >
        <Link
          to="/inbox"
          style={{ textDecoration: "none", color: ui.colors.brand }}
        >
          Back to Inbox
        </Link>
        <h2 style={{ marginTop: 8, marginBottom: 0 }}>Admins only</h2>
        <div style={{ ...ui.text.subtitle, maxWidth: 560 }}>
          You do not have permission to manage appointment categories and
          appointment types.
        </div>
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
      <div>
        <div style={{ fontSize: 28, fontWeight: 900, color: ui.colors.text }}>
          Appointment Types
        </div>
      </div>

      <div className="appointment-admin-layout" style={{ marginTop: 18 }}>
        <section className="appointment-admin-column appointment-admin-column--categories">
          <div
            className={`appointment-admin-main-card ${
              selectedCategoryId === "__new__" || selectedCategory
                ? "appointment-admin-main-card--categories"
                : "appointment-admin-main-card--categories-empty"
            }`}
            style={{
              ...cardStyle,
              padding: 16,
            }}
          >
            <div
              className="appointment-admin-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900 }}>Categories</div>
              <button
                type="button"
                onClick={beginNewCategory}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid rgba(168,85,247,0.35)`,
                  background: ui.colors.brandSoft,
                  color: ui.colors.text,
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Add category
              </button>
            </div>

            <div
              className="appointment-admin-selector-card appointment-admin-scroll"
              style={{
                ...cardStyle,
                padding: 16,
                overflowY: "auto",
                overflowX: "hidden",
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={async (event) => {
                event.preventDefault();
                if (!dragCategoryId) return;
                const next = [...visibleCategories];
                endDrag(setDragCategoryId, setDragOverCategoryId);
                await persistCategoryOrder(next);
              }}
            >
              {visibleCategories.length === 0 ? (
                <div style={{ padding: 4, color: ui.colors.muted }}>
                  No appointment categories are available.
                </div>
              ) : (
                <div
                  style={{ display: "grid", gap: 8, overflowX: "hidden" }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                >
                  {visibleCategories.map((category) => {
                    const isSelected = selectedCategoryId === category.id;

                    return (
                      <RowCard
                        key={category.id}
                        isSelected={isSelected}
                        isDragging={dragCategoryId === category.id}
                        isDropTarget={Boolean(
                          dragCategoryId &&
                          dragCategoryId !== category.id &&
                          dragOverCategoryId === category.id,
                        )}
                        draggable
                        onDragStart={(event) =>
                          startDrag(
                            setDragCategoryId,
                            setDragOverCategoryId,
                            category.id,
                            event,
                          )
                        }
                        onDragEnd={() =>
                          endDrag(setDragCategoryId, setDragOverCategoryId)
                        }
                        onDragEnter={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (!dragCategoryId || dragCategoryId === category.id)
                            return;
                          setDragOverCategoryId(category.id);
                          reorderCategoriesDuringDrag(
                            dragCategoryId,
                            category.id,
                          );
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (!dragCategoryId || dragCategoryId === category.id)
                            return;
                          setDragOverCategoryId(category.id);
                          reorderCategoriesDuringDrag(
                            dragCategoryId,
                            category.id,
                          );
                        }}
                        onDrop={async (event) => {
                          event.preventDefault();
                          const next = [...visibleCategories];
                          endDrag(setDragCategoryId, setDragOverCategoryId);
                          await persistCategoryOrder(next);
                        }}
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setSelectedTypeId("");
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              minWidth: 0,
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 18,
                                color: ui.colors.muted,
                                fontWeight: 900,
                                fontSize: 14,
                                lineHeight: 1,
                                cursor: "default",
                                transition:
                                  "transform 180ms ease, color 140ms ease",
                                transform:
                                  dragCategoryId === category.id
                                    ? "translateY(-1px)"
                                    : "translateY(0)",
                              }}
                            >
                              ≡
                            </span>
                            <span
                              style={{
                                fontWeight: 900,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {category.name}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: category.is_active
                                ? ui.colors.text
                                : ui.colors.muted,
                              background: category.is_active
                                ? "rgba(15,23,42,0.06)"
                                : "rgba(100,116,139,0.10)",
                              border: `1px solid ${ui.colors.border}`,
                              borderRadius: 999,
                              padding: "4px 8px",
                              flex: "0 0 auto",
                            }}
                          >
                            {category.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </RowCard>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedCategoryId === "__new__" || selectedCategory ? (
              <div className="appointment-admin-detail-shell">
                <form
                  id="appointment-category-detail-form"
                  className="appointment-admin-detail-card appointment-admin-scroll"
                  onSubmit={saveCategory}
                  style={{
                    ...cardStyle,
                    padding: 16,
                    display: "grid",
                    gap: 16,
                    alignContent: "start",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {isNewCategory
                      ? "New category"
                      : categoryDraft.name || "Category details"}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 180px",
                      gap: 12,
                    }}
                  >
                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Name
                      <input
                        value={categoryDraft.name}
                        onChange={(event) =>
                          setCategoryDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        style={{ ...inputStyle, marginTop: 6 }}
                      />
                    </label>

                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Status
                      <select
                        value={categoryDraft.is_active ? "active" : "inactive"}
                        onChange={(event) =>
                          setCategoryDraft((prev) => ({
                            ...prev,
                            is_active: event.target.value === "active",
                          }))
                        }
                        style={{ ...inputStyle, marginTop: 6 }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                  </div>
                </form>

                <div
                  className="appointment-admin-sticky-footer"
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={resetCategoryDraft}
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
                    Cancel
                  </button>

                  {!isNewCategory ? (
                    <button
                      type="button"
                      onClick={() =>
                        toggleCategoryActive(!categoryDraft.is_active)
                      }
                      disabled={savingCategory}
                      style={{
                        padding: "9px 12px",
                        borderRadius: ui.radius.md,
                        border: categoryDraft.is_active
                          ? "1px solid rgba(239,68,68,0.35)"
                          : `1px solid ${ui.colors.border}`,
                        background: categoryDraft.is_active
                          ? "rgba(239,68,68,0.12)"
                          : ui.colors.cardBg,
                        color: ui.colors.text,
                        cursor: savingCategory ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        opacity: savingCategory ? 0.6 : 1,
                      }}
                    >
                      {categoryDraft.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  ) : null}

                  <button
                    type="submit"
                    form="appointment-category-detail-form"
                    disabled={savingCategory}
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: `1px solid rgba(168,85,247,0.35)`,
                      background: ui.colors.brandSoft,
                      color: ui.colors.text,
                      cursor: savingCategory ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: savingCategory ? 0.6 : 1,
                    }}
                  >
                    {savingCategory
                      ? "Saving..."
                      : isNewCategory
                        ? "Create"
                        : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="appointment-admin-column appointment-admin-column--types">
          <div
            className={`appointment-admin-main-card ${
              selectedTypeId === "__new__" || selectedType
                ? "appointment-admin-main-card--types"
                : "appointment-admin-main-card--types-empty"
            }`}
            style={{
              ...cardStyle,
              padding: 16,
            }}
          >
            <div
              className="appointment-admin-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 900 }}>Types</div>
              <button
                type="button"
                onClick={beginNewType}
                disabled={!selectedCategory}
                style={{
                  padding: "9px 12px",
                  borderRadius: ui.radius.md,
                  border: `1px solid rgba(168,85,247,0.35)`,
                  background: ui.colors.brandSoft,
                  color: ui.colors.text,
                  cursor: !selectedCategory ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: !selectedCategory ? 0.6 : 1,
                }}
              >
                Add type
              </button>
            </div>

            <div
              className="appointment-admin-selector-card appointment-admin-scroll"
              style={{
                ...cardStyle,
                padding: 16,
                overflowY: "auto",
                overflowX: "hidden",
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={async (event) => {
                event.preventDefault();
                if (!dragTypeId) return;
                const next = [...visibleTypes];
                endDrag(setDragTypeId, setDragOverTypeId);
                await persistTypeOrder(next);
              }}
            >
              {!selectedCategory ? (
                <div style={{ padding: 4, color: ui.colors.muted }}>
                  Select a category to view appointment types.
                </div>
              ) : visibleTypes.length === 0 ? (
                <div style={{ padding: 4, color: ui.colors.muted }}>
                  No current booking types are mapped to this category.
                </div>
              ) : (
                <div
                  className="appointment-admin-row-list"
                  style={{ display: "grid", gap: 8, overflowX: "hidden" }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                >
                  {visibleTypes.map((type) => {
                    const isSelected = selectedTypeId === type.id;

                    return (
                      <RowCard
                        key={type.id}
                        isSelected={isSelected}
                        isDragging={dragTypeId === type.id}
                        isDropTarget={Boolean(
                          dragTypeId &&
                          dragTypeId !== type.id &&
                          dragOverTypeId === type.id,
                        )}
                        draggable
                        onDragStart={(event) =>
                          startDrag(
                            setDragTypeId,
                            setDragOverTypeId,
                            type.id,
                            event,
                          )
                        }
                        onDragEnd={() =>
                          endDrag(setDragTypeId, setDragOverTypeId)
                        }
                        onDragEnter={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (!dragTypeId || dragTypeId === type.id) return;

                          setDragOverTypeId(type.id);
                          reorderVisibleTypesDuringDrag(dragTypeId, type.id);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (!dragTypeId || dragTypeId === type.id) return;

                          setDragOverTypeId(type.id);
                          reorderVisibleTypesDuringDrag(dragTypeId, type.id);
                        }}
                        onDrop={async (event) => {
                          event.preventDefault();
                          const next = [...visibleTypes];
                          endDrag(setDragTypeId, setDragOverTypeId);
                          await persistTypeOrder(next);
                        }}
                        onClick={() => setSelectedTypeId(type.id)}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              minWidth: 0,
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 18,
                                color: ui.colors.muted,
                                fontWeight: 900,
                                fontSize: 14,
                                lineHeight: 1,
                                cursor: "default",
                                transition:
                                  "transform 180ms ease, color 140ms ease",
                                transform:
                                  dragTypeId === type.id
                                    ? "translateY(-1px)"
                                    : "translateY(0)",
                              }}
                            >
                              ≡
                            </span>
                            <div
                              style={{
                                minWidth: 0,
                                fontWeight: 900,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {type.editor_name}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flex: "0 0 auto",
                            }}
                          >
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 999,
                                background: resolvePickerColor(type.color),
                                border: "1px solid rgba(15,23,42,0.15)",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                color: type.is_active
                                  ? ui.colors.text
                                  : ui.colors.muted,
                                background: type.is_active
                                  ? "rgba(15,23,42,0.06)"
                                  : "rgba(100,116,139,0.10)",
                                border: `1px solid ${ui.colors.border}`,
                                borderRadius: 999,
                                padding: "4px 8px",
                              }}
                            >
                              {type.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </RowCard>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedTypeId === "__new__" || selectedType ? (
              <div className="appointment-admin-detail-shell">
                <form
                  id="appointment-type-detail-form"
                  onSubmit={saveType}
                  className="appointment-admin-detail-card appointment-admin-scroll"
                  style={{
                    ...cardStyle,
                    padding: 16,
                    display: "grid",
                    gap: 16,
                    paddingRight: 4,
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 900 }}>
                    {isNewType
                      ? "New appointment type"
                      : typeDraft.name || "Type details"}
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
                        value={typeDraft.name}
                        onChange={(event) =>
                          setTypeDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        style={{ ...inputStyle, marginTop: 6 }}
                      />
                    </label>

                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Category
                      <select
                        value={typeDraft.category_id}
                        onChange={(event) =>
                          setTypeDraft((prev) => ({
                            ...prev,
                            category_id: event.target.value,
                          }))
                        }
                        style={{ ...inputStyle, marginTop: 6 }}
                      >
                        <option value="">Select category...</option>
                        {visibleCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Default duration
                      <input
                        type="number"
                        min="5"
                        max="480"
                        value={typeDraft.duration_minutes}
                        onChange={(event) =>
                          setTypeDraft((prev) => ({
                            ...prev,
                            duration_minutes: Number(event.target.value || 0),
                          }))
                        }
                        style={{ ...inputStyle, marginTop: 6 }}
                      />
                    </label>

                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Status
                      <select
                        value={typeDraft.is_active ? "active" : "inactive"}
                        onChange={(event) =>
                          setTypeDraft((prev) => ({
                            ...prev,
                            is_active: event.target.value === "active",
                          }))
                        }
                        style={{ ...inputStyle, marginTop: 6 }}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>

                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      <span style={{ display: "block", marginBottom: 6 }}>
                        Background
                      </span>
                      <input
                        type="color"
                        value={resolvePickerColor(typeDraft.color)}
                        onChange={(event) =>
                          setTypeDraft((prev) => ({
                            ...prev,
                            color: event.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          minWidth: 0,
                          height: 42,
                          padding: 4,
                          borderRadius: ui.radius.md,
                          border: `1px solid ${ui.colors.border}`,
                          background: ui.colors.cardBg,
                          boxSizing: "border-box",
                          display: "block",
                          cursor: "pointer",
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      <span style={{ display: "block", marginBottom: 6 }}>
                        Text colour
                      </span>
                      <input
                        type="color"
                        value={resolvePickerColor(typeDraft.text_color)}
                        onChange={(event) =>
                          setTypeDraft((prev) => ({
                            ...prev,
                            text_color: event.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          minWidth: 0,
                          height: 42,
                          padding: 4,
                          borderRadius: ui.radius.md,
                          border: `1px solid ${ui.colors.border}`,
                          background: ui.colors.cardBg,
                          boxSizing: "border-box",
                          display: "block",
                          cursor: "pointer",
                        }}
                      />
                    </label>
                  </div>

                  <label style={{ fontSize: 13, fontWeight: 700 }}>
                    Notes / description
                    <textarea
                      rows={4}
                      value={typeDraft.description}
                      onChange={(event) =>
                        setTypeDraft((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                      style={{
                        ...inputStyle,
                        marginTop: 6,
                        resize: "vertical",
                      }}
                    />
                  </label>
                </form>

                <div
                  className="appointment-admin-sticky-footer"
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={discardTypeDraft}
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
                    Discard
                  </button>

                  {!isNewType ? (
                    <button
                      type="button"
                      onClick={() => toggleTypeActive(!typeDraft.is_active)}
                      disabled={savingType}
                      style={{
                        padding: "9px 12px",
                        borderRadius: ui.radius.md,
                        border: typeDraft.is_active
                          ? "1px solid rgba(239,68,68,0.35)"
                          : `1px solid ${ui.colors.border}`,
                        background: typeDraft.is_active
                          ? "rgba(239,68,68,0.12)"
                          : ui.colors.cardBg,
                        color: ui.colors.text,
                        cursor: savingType ? "not-allowed" : "pointer",
                        fontWeight: 900,
                        opacity: savingType ? 0.6 : 1,
                      }}
                    >
                      {typeDraft.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  ) : null}

                  <button
                    type="submit"
                    form="appointment-type-detail-form"
                    disabled={savingType}
                    style={{
                      padding: "9px 12px",
                      borderRadius: ui.radius.md,
                      border: `1px solid rgba(168,85,247,0.35)`,
                      background: ui.colors.brandSoft,
                      color: ui.colors.text,
                      cursor: savingType ? "not-allowed" : "pointer",
                      fontWeight: 900,
                      opacity: savingType ? 0.6 : 1,
                    }}
                  >
                    {savingType ? "Saving..." : "Save & close"}
                  </button>
                </div>
              </div>
            ) : null}
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
            maxWidth: "min(420px, calc(100vw - 32px))",
            padding: "14px 16px",
            borderRadius: 15,
            border:
              toast.type === "error"
                ? "1px solid rgba(239, 68, 68, 0.35)"
                : toast.type === "info"
                  ? "1px solid rgba(59, 130, 246, 0.3)"
                  : "1px solid rgba(34, 197, 94, 0.35)",
            boxShadow: "0 14px 32px rgba(15, 23, 42, 0.18)",
            color: ui.colors.text,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.35,
            zIndex: 950,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            background:
              toast.type === "error"
                ? "rgba(239, 68, 68, 0.07)"
                : toast.type === "info"
                  ? "rgba(59, 130, 246, 0.07)"
                  : "rgba(34, 197, 94, 0.07)",
          }}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
