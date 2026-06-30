type AppointmentEmailLayoutInput = {
  bodyHtml: string;
  bodyText: string;
  subject: string;
  details: {
    appointmentType?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    siteName?: string;
    areaName?: string;
    staffName?: string;
  };
  brandName?: string;
  brandAccent?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function trimmedValue(value: unknown) {
  return String(value || "").trim();
}

function buildDetailRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:0 0 6px 0; width:132px; font-size:13px; line-height:20px; color:#475569; font-weight:700; vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:0 0 6px 0; font-size:13px; line-height:20px; color:#0f172a; vertical-align:top;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `.trim();
}

function buildAppointmentDetailsTable(details: AppointmentEmailLayoutInput["details"]) {
  const rows = [
    ["Appointment", trimmedValue(details.appointmentType)],
    ["Date", trimmedValue(details.appointmentDate)],
    ["Time", trimmedValue(details.appointmentTime)],
    ["Site", trimmedValue(details.siteName)],
    ["Area", trimmedValue(details.areaName)],
    ["Staff", trimmedValue(details.staffName)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => buildDetailRow(label, value))
    .join("");

  if (!rows) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin:0 0 24px 0;">
      <tr>
        <td style="padding:0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:separate; border-spacing:0; background:#f8fafc; border:1px solid #dbe4ee; border-radius:14px;">
            <tr>
              <td style="padding:18px 20px 14px 20px;">
                <div style="margin:0 0 12px 0; font-size:12px; line-height:18px; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; font-weight:800;">
                  Appointment details
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
                  ${rows}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();
}

export function isFullHtmlDocument(value: string) {
  const normalized = trimmedValue(value).toLowerCase();
  return (
    normalized.startsWith("<!doctype") ||
    normalized.includes("<html") ||
    normalized.includes("<body")
  );
}

export function renderAppointmentEmailHtml(input: AppointmentEmailLayoutInput) {
  const bodyHtml = trimmedValue(input.bodyHtml);
  if (!bodyHtml) return "";
  if (isFullHtmlDocument(bodyHtml)) return bodyHtml;

  const detailsHtml = buildAppointmentDetailsTable(input.details);
  const subject = trimmedValue(input.subject) || "Appointment update";
  const brandName = trimmedValue(input.brandName) || "Slanj Kilts";
  const brandAccent = trimmedValue(input.brandAccent) || "HUB";
  const previewText =
    trimmedValue(input.bodyText)
      .replace(/\s+/g, " ")
      .slice(0, 140) || subject;

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#edf2f7; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
    <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      ${escapeHtml(previewText)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; background:#edf2f7;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; border-collapse:separate; border-spacing:0;">
            <tr>
              <td style="padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:separate; border-spacing:0;">
                  <tr>
                    <td style="padding:18px 24px; background:#0f172a; color:#f8fafc; border-radius:18px 18px 0 0;">
                      <div style="font-size:11px; line-height:16px; letter-spacing:0.12em; text-transform:uppercase; color:#cbd5e1; font-weight:800;">
                        ${escapeHtml(brandAccent)}
                      </div>
                      <div style="margin-top:6px; font-size:28px; line-height:32px; font-weight:800; color:#ffffff;">
                        ${escapeHtml(brandName)}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#ffffff; border:1px solid #dbe4ee; border-top:none; border-radius:0 0 18px 18px; padding:28px 24px 24px 24px;">
                      <div style="margin:0 0 20px 0; font-size:24px; line-height:30px; font-weight:800; color:#0f172a;">
                        ${escapeHtml(subject)}
                      </div>
                      ${detailsHtml}
                      <div style="font-size:15px; line-height:24px; color:#0f172a;">
                        ${bodyHtml}
                      </div>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse; margin-top:28px;">
                        <tr>
                          <td style="border-top:1px solid #e2e8f0; padding-top:18px; font-size:12px; line-height:20px; color:#64748b;">
                            Please contact Slanj directly if you need to make changes to your appointment.
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}
