/**
 * Augusta Concierge — one-time upgrade script.
 * Run upgradeAugustaForm() once to:
 *   - Polish the form (section break, optional website field, friendly confirmation)
 *   - Add an Approved/Denied dropdown to column M of the responses sheet
 *   - Color-code rows by status (green = Approved, red = Denied, yellow = blank/Pending)
 *   - Create a trigger that emails Tyler whenever a new event is submitted
 *
 * The onAugustaFormSubmit() function is the trigger handler — don't run it directly.
 *
 * IMPORTANT: paste this as a NEW file inside the existing "Augusta Form Builder"
 * Apps Script project so it can find the form by its ID below.
 */

const FORM_TITLE = "Submit an Elkins Arts Event";
const SHEET_TITLE = "Augusta Concierge Events (responses)";
const NOTIFY_EMAIL = "tylercrites3@gmail.com";
const APPROVED_COLUMN = 13; // Column M

function findFileIdByTitle_(title, mimeType) {
  const it = DriveApp.searchFiles(
    `title = "${title.replace(/"/g, '\\"')}" and mimeType = "${mimeType}" and trashed = false`
  );
  if (it.hasNext()) return it.next().getId();
  throw new Error(`Could not find a file titled "${title}". Did you rename it?`);
}

function upgradeAugustaForm() {
  const formId = findFileIdByTitle_(FORM_TITLE, "application/vnd.google-apps.form");
  const sheetId = findFileIdByTitle_(SHEET_TITLE, "application/vnd.google-apps.spreadsheet");
  Logger.log("Found form ID:  " + formId);
  Logger.log("Found sheet ID: " + sheetId);

  const form = FormApp.openById(formId);
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName("Form Responses 1") || ss.getSheets()[0];

  polishForm_(form);
  setupApprovalDropdown_(sheet);
  installTrigger_(form);

  Logger.log("=== UPGRADE COMPLETE ===");
  Logger.log("- Form polished with friendlier copy + optional website field");
  Logger.log("- Approved/Denied dropdown on column M");
  Logger.log("- Color coding rules added (green/red/yellow)");
  Logger.log("- Email notifications will go to: " + NOTIFY_EMAIL);
  Logger.log("Submit a test event at: " + form.getPublishedUrl());
}

function polishForm_(form) {
  form
    .setDescription(
      "Submit your Elkins-area arts event so it shows up in the Augusta Heritage Center concierge chatbot. " +
      "Submissions are reviewed and usually approved within 24 hours. Once approved, your event appears in the bot within an hour."
    )
    .setConfirmationMessage(
      "Thanks for submitting! Your event has been sent to Augusta staff for review. " +
      "Once approved, it'll be live in the Augusta concierge chatbot at augustaartsandculture.org."
    );

  // Add an optional website/registration link field if not already present
  const hasWebsite = form.getItems().some(it => it.getTitle() === "Event website or registration link");
  if (!hasWebsite) {
    form.addTextItem()
      .setTitle("Event website or registration link")
      .setHelpText("Optional. If your event has its own page (Eventbrite, your studio site, Facebook event), paste the URL here.")
      .setRequired(false);
  }
}

function setupApprovalDropdown_(sheet) {
  // Ensure column M header is "Approved"
  sheet.getRange(1, APPROVED_COLUMN).setValue("Approved").setFontWeight("bold");

  // Dropdown on M2:M1000
  const range = sheet.getRange(2, APPROVED_COLUMN, 999, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Approved", "Denied"], true)
    .setAllowInvalid(false)
    .setHelpText("Pick Approved to publish to the chatbot, or Denied to reject. Blank = pending.")
    .build();
  range.setDataValidation(rule);

  // Color coding: green for Approved, red for Denied, yellow for blank/pending
  const existing = sheet.getConditionalFormatRules();
  const wholeRow = sheet.getRange("A2:M1000");
  const approvedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$M2="Approved"')
    .setBackground("#d6ead3")
    .setRanges([wholeRow])
    .build();
  const deniedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$M2="Denied"')
    .setBackground("#f4cccc")
    .setRanges([wholeRow])
    .build();
  const pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",$M2="")')
    .setBackground("#fff2cc")
    .setRanges([wholeRow])
    .build();
  sheet.setConditionalFormatRules([...existing, approvedRule, deniedRule, pendingRule]);
}

function installTrigger_(form) {
  // Remove any old triggers we may have created
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "onAugustaFormSubmit") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("onAugustaFormSubmit")
    .forForm(form)
    .onFormSubmit()
    .create();
}

/**
 * Trigger handler — runs when a new form response is submitted.
 * Emails the notify address with the event details + a deep link to the row.
 */
function onAugustaFormSubmit(e) {
  try {
    const response = e.response;
    const items = response.getItemResponses();
    const get = (title) => {
      const item = items.find(i => i.getItem().getTitle() === title);
      return item ? item.getResponse() : "(not provided)";
    };

    const title = get("Event title");
    const org = get("Your name or organization");
    const startDate = get("Start date");
    const endDate = get("End date");
    const startTime = get("Start time");
    const location = get("Location");
    const price = get("Price");
    const description = get("Description");
    const website = get("Event website or registration link");
    const contactEmail = get("Your contact email");

    const sheetId = findFileIdByTitle_(SHEET_TITLE, "application/vnd.google-apps.spreadsheet");
    const ss = SpreadsheetApp.openById(sheetId);
    const sheet = ss.getSheetByName("Form Responses 1") || ss.getSheets()[0];
    const lastRow = sheet.getLastRow();
    const sheetUrl = `${ss.getUrl()}#gid=${sheet.getSheetId()}&range=M${lastRow}`;

    const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`;

    const subject = `New event submission: ${title}`;
    const plain = [
      `New event submitted for the Augusta concierge chatbot:`,
      ``,
      `Event:        ${title}`,
      `Submitted by: ${org}`,
      `When:         ${dateRange} at ${startTime}`,
      `Where:        ${location}`,
      `Price:        ${price}`,
      website && website !== "(not provided)" ? `Website:      ${website}` : null,
      ``,
      `Description:`,
      description,
      ``,
      `Contact: ${contactEmail}`,
      ``,
      `Approve or deny:`,
      sheetUrl,
      ``,
      `In column M of the sheet, pick "Approved" to publish to the chatbot, or "Denied" to reject. Bot updates within an hour.`,
    ].filter(Boolean).join("\n");

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;color:#1a1a1a;">
        <div style="background:#2e5d3a;color:#faf6ee;padding:18px 24px;">
          <div style="font-size:13px;letter-spacing:1px;opacity:0.85;">AUGUSTA CONCIERGE</div>
          <div style="font-size:20px;font-weight:600;margin-top:4px;">New event submission</div>
        </div>
        <div style="padding:24px;background:#faf6ee;">
          <h2 style="color:#1e4226;margin:0 0 4px;">${escapeHtml_(title)}</h2>
          <div style="color:#6b6b6b;margin-bottom:18px;">${escapeHtml_(org)}</div>

          <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:18px;">
            <tr><td style="padding:6px 0;color:#6b6b6b;width:90px;">When</td><td>${escapeHtml_(dateRange)} at ${escapeHtml_(startTime)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Where</td><td>${escapeHtml_(location)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b6b6b;">Price</td><td>${escapeHtml_(price)}</td></tr>
            ${website && website !== "(not provided)" ? `<tr><td style="padding:6px 0;color:#6b6b6b;">Website</td><td><a href="${escapeHtml_(website)}">${escapeHtml_(website)}</a></td></tr>` : ""}
            <tr><td style="padding:6px 0;color:#6b6b6b;">Contact</td><td>${escapeHtml_(contactEmail)}</td></tr>
          </table>

          <div style="background:#fff;border:1px solid #e5e0d3;padding:14px;margin-bottom:24px;font-size:14px;line-height:1.5;">
            ${escapeHtml_(description).replace(/\n/g, "<br>")}
          </div>

          <a href="${sheetUrl}" style="background:#2e5d3a;color:#faf6ee;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600;">
            Open sheet to approve
          </a>
          <div style="color:#6b6b6b;font-size:12px;margin-top:16px;">
            In column M, pick <strong>Approved</strong> to publish to the chatbot, or <strong>Denied</strong> to reject. Changes appear in the bot within an hour.
          </div>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject,
      body: plain,
      htmlBody: html,
    });
  } catch (err) {
    Logger.log("onAugustaFormSubmit error: " + err.message);
  }
}

function escapeHtml_(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
