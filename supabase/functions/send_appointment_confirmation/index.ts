import { serveAppointmentEmail } from "../_shared/appointmentEmail.ts";

serveAppointmentEmail({
  emailType: "confirmation",
  auditAction: "confirmation_sent",
  cancelledError: "Cancelled appointments cannot be confirmed by email.",
  successMessage: "Confirmation email sent.",
  configErrorMessage:
    "Confirmation email could not be sent because email delivery is not configured on this environment.",
  fallbackSubject: "Appointment confirmation - Slanj Kilts",
  buildFallbackText: (replacements) =>
    [
      `Hi ${replacements.customer_name},`,
      "",
      `Your ${replacements.appointment_type} appointment has been confirmed for ${replacements.appointment_date} at ${replacements.appointment_time}.`,
      "",
      "Location:",
      `${replacements.site_name}`,
      `${replacements.area_name}`,
      "",
      "If you need to make any changes, please contact us directly.",
      "",
      "Thanks,",
      "Slanj Kilts",
    ].join("\n"),
  legacyFields: {
    subject: "email_subject",
    bodyText: "email_body_text",
    bodyHtml: "email_body_html",
  },
});
