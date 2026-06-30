import { serveAppointmentEmail } from "../_shared/appointmentEmail.ts";

serveAppointmentEmail({
  emailType: "reminder",
  auditAction: "reminder_sent",
  cancelledError: "Cancelled appointments cannot be sent reminder emails.",
  successMessage: "Reminder email sent.",
  configErrorMessage:
    "Reminder email could not be sent because email delivery is not configured on this environment.",
  fallbackSubject: "Appointment reminder - Slanj Kilts",
  buildFallbackText: (replacements) =>
    [
      `Hi ${replacements.customer_name},`,
      "",
      `This is a reminder of your ${replacements.appointment_type} appointment with Slanj Kilts.`,
      "",
      "Appointment:",
      `${replacements.appointment_date} at ${replacements.appointment_time}`,
      "",
      "Location:",
      `${replacements.site_name}`,
      "",
      "If you need to make any changes, please contact us directly.",
      "",
      "Thanks,",
      "Slanj Kilts",
    ].join("\n"),
  legacyFields: {
    subject: "reminder_email_subject",
    bodyText: "reminder_email_body_text",
    bodyHtml: "reminder_email_body_html",
  },
});
