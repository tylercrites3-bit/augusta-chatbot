/**
 * Augusta Concierge — one-time upgrade script.
 * Run upgradeAugustaForm() once to:
 *   - Polish the form (section break, optional website field, friendly confirmation)
 *   - Add an Approved/Denied dropdown to column M of the responses sheet
 *   - Add a "Denial reason" text column to column N
 *   - Color-code rows by status (green = Approved, red = Denied, yellow = blank/Pending)
 *   - Create a trigger that emails Tyler whenever a new event is submitted
 *   - Auto-reply to artists when their event is Approved or Denied (with reason if provided)
 *
 * The onAugustaFormSubmit() and onApprovalEdit() functions are trigger handlers — don't run them directly.
 *
 * IMPORTANT: paste this as a NEW file inside the existing "Augusta Form Builder"
 * Apps Script project so it can find the form by its ID below.
 */

const FORM_TITLE = "Submit an Elkins Arts Event";
const SHEET_TITLE = "Augusta Concierge Events (responses)";
const NOTIFY_EMAIL = "tylercrites3@gmail.com";

// Column headers used to find our staff columns dynamically.
// Don't rely on hardcoded column numbers — Google Forms can shift columns.
const APPROVED_HEADER = "Approved";
const REASON_HEADER   = "Denial reason (optional)";

function findFileIdByTitle_(title, mimeType) {
  const it = DriveApp.searchFiles(
    `title = "${title.replace(/"/g, '\\"')}" and mimeType = "${mimeType}" and trashed = false`
  );
  if (it.hasNext()) return it.next().getId();
  throw new Error(`Could not find a file titled "${title}". Did you rename it?`);
}

/**
 * Returns the 1-based column index whose row-1 header matches `title` (case-insensitive).
 * Returns -1 if not found.
 */
function findHeaderColumn_(sheet, title) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return -1;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headers.findIndex(h => String(h).trim().toLowerCase() === title.toLowerCase());
  return idx === -1 ? -1 : idx + 1;
}

/**
 * Converts a 1-based column number to its A1 letter(s). e.g. 13 → "M", 27 → "AA".
 */
function colLetter_(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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
  installApprovalTrigger_(ss);

  Logger.log("=== UPGRADE COMPLETE ===");
  Logger.log("- Form polished with friendlier copy + optional website field");
  Logger.log("- Approved/Denied dropdown on column M");
  Logger.log("- Denial reason text field on column N (fill this in before denying)");
  Logger.log("- Color coding rules added (green/red/yellow)");
  Logger.log("- Submission emails will go to: " + NOTIFY_EMAIL);
  Logger.log("- Auto-replies will email artists when their event is Approved or Denied");
  Logger.log("- Denial emails will include the column N reason if you fill it in");
  Logger.log("Submit a test event at: " + form.getPublishedUrl());
}

function installApprovalTrigger_(ss) {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "onApprovalEdit") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("onApprovalEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();
}

/**
 * Sheet edit trigger — runs whenever any cell is changed.
 * Finds the "Approved" column by header name (robust to column shifts),
 * then emails the submitter when a decision is made.
 *
 * Workflow for denial:
 *   1. Type the reason into the "Denial reason (optional)" column of the row
 *   2. Set the "Approved" column to "Denied" — trigger fires and emails with the reason
 */
function onApprovalEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();

    // Find the Approved column dynamically — never hardcode a column number
    const approvedCol = findHeaderColumn_(sheet, APPROVED_HEADER);
    if (approvedCol === -1) {
      Logger.log("onApprovalEdit: could not find '" + APPROVED_HEADER + "' column — run upgradeAugustaForm() first.");
      return;
    }
    if (e.range.getColumn() !== approvedCol) return;

    const row = e.range.getRow();
    if (row < 2) return;
    const decision = e.value;
    if (decision !== "Approved" && decision !== "Denied") return;

    // Read the whole row up to and including the reason column
    const reasonCol = findHeaderColumn_(sheet, REASON_HEADER);
    const readUpTo  = reasonCol !== -1 ? reasonCol : approvedCol;
    const data = sheet.getRange(row, 1, 1, readUpTo).getValues()[0];

    // Email: prefer Google's auto-collected address (col B = index 1),
    // fall back to the "Your contact email" form field (find it by header)
    const contactEmailCol = findHeaderColumn_(sheet, "Your contact email");
    const submitterEmail  = String(data[1] || (contactEmailCol !== -1 ? data[contactEmailCol - 1] : "") || "").trim();

    const eventTitle   = String(data[2] || "").trim();
    const orgName      = String(data[3] || "there").trim();
    const denialReason = reasonCol !== -1 ? String(data[reasonCol - 1] || "").trim() : "";

    if (!submitterEmail) {
      Logger.log("onApprovalEdit: no submitter email found for row " + row);
      return;
    }

    Logger.log("onApprovalEdit: " + decision + " — sending email to " + submitterEmail);

    let subject, plain, html;
    if (decision === "Approved") {
      subject = `Your event is now live in the Augusta concierge: ${eventTitle}`;
      plain = [
        `Hi ${orgName},`,
        ``,
        `Great news — your event "${eventTitle}" has been approved and will appear in the Augusta Heritage Center concierge chatbot within the next hour. Visitors to augustaartsandculture.org can now ask the chatbot about it.`,
        ``,
        `Thanks for helping us showcase the Elkins arts community!`,
        ``,
        `— Augusta Heritage Center`,
      ].join("\n");
      html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1a1a1a;">
          <div style="background:#2e5d3a;color:#faf6ee;padding:18px 24px;">
            <div style="font-size:13px;letter-spacing:1px;opacity:0.85;">AUGUSTA CONCIERGE</div>
            <div style="font-size:20px;font-weight:600;margin-top:4px;">Your event is approved ✓</div>
          </div>
          <div style="padding:24px;background:#faf6ee;font-size:15px;line-height:1.55;">
            <p>Hi ${escapeHtml_(orgName)},</p>
            <p>Great news — your event <strong>${escapeHtml_(eventTitle)}</strong> has been approved and will appear in the Augusta Heritage Center concierge chatbot within the next hour. Visitors to augustaartsandculture.org can now ask the bot about it.</p>
            <p>Thanks for helping us showcase the Elkins arts community!</p>
            <p style="color:#6b6b6b;">— Augusta Heritage Center</p>
          </div>
        </div>`;
    } else {
      subject = `Re: your event submission to Augusta Heritage Center`;
      const reasonBlock = denialReason
        ? `\n\nReason: ${denialReason}\n`
        : ``;
      plain = [
        `Hi ${orgName},`,
        ``,
        `Thanks for submitting "${eventTitle}" to the Augusta concierge chatbot. After review, we weren't able to include this event in the bot at this time.${reasonBlock}`,
        `If you have questions or want to revise and resubmit, please reply to this email.`,
        ``,
        `— Augusta Heritage Center`,
      ].join("\n");
      const reasonHtml = denialReason
        ? `<div style="background:#fff3f3;border-left:3px solid #c0392b;padding:10px 14px;margin:16px 0;font-size:14px;color:#5a1e1e;">
             <strong>Reason:</strong> ${escapeHtml_(denialReason)}
           </div>`
        : ``;
      html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#1a1a1a;">
          <div style="background:#2e5d3a;color:#faf6ee;padding:18px 24px;">
            <div style="font-size:13px;letter-spacing:1px;opacity:0.85;">AUGUSTA CONCIERGE</div>
            <div style="font-size:20px;font-weight:600;margin-top:4px;">Submission update</div>
          </div>
          <div style="padding:24px;background:#faf6ee;font-size:15px;line-height:1.55;">
            <p>Hi ${escapeHtml_(orgName)},</p>
            <p>Thanks for submitting <strong>${escapeHtml_(eventTitle)}</strong> to the Augusta concierge chatbot. After review, we weren't able to include this event in the bot at this time.</p>
            ${reasonHtml}
            <p>If you have questions or want to revise and resubmit, please reply to this email.</p>
            <p style="color:#6b6b6b;">— Augusta Heritage Center</p>
          </div>
        </div>`;
    }

    MailApp.sendEmail({ to: submitterEmail, subject, body: plain, htmlBody: html });
  } catch (err) {
    Logger.log("onApprovalEdit error: " + err.message);
  }
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
  // --- Find or create the "Approved" column ---
  // Always place it AFTER the last existing column so it never conflicts
  // with Google Forms response columns (which shift as questions are added).
  let approvedCol = findHeaderColumn_(sheet, APPROVED_HEADER);
  if (approvedCol === -1) {
    approvedCol = sheet.getLastColumn() + 1;
  }

  // --- Find or create the "Denial reason" column (one past Approved) ---
  let reasonCol = findHeaderColumn_(sheet, REASON_HEADER);
  if (reasonCol === -1) {
    reasonCol = approvedCol + 1;
  }

  // Write the two staff column headers
  sheet.getRange(1, approvedCol).setValue(APPROVED_HEADER).setFontWeight("bold");
  sheet.getRange(1, reasonCol)
    .setValue(REASON_HEADER)
    .setFontWeight("bold")
    .setNote("Fill this in BEFORE setting the Approved column to Denied. The reason will be included in the artist's email.");

  Logger.log("Approved column: " + colLetter_(approvedCol) + " (" + approvedCol + ")");
  Logger.log("Denial reason column: " + colLetter_(reasonCol) + " (" + reasonCol + ")");

  // Dropdown on approvedCol rows 2-1000
  const dropRange = sheet.getRange(2, approvedCol, 999, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Approved", "Denied"], true)
    .setAllowInvalid(false)
    .setHelpText("Pick Approved to publish to the chatbot, or Denied to reject. Blank = pending.")
    .build();
  dropRange.setDataValidation(rule);

  // Color-code entire row through the reason column using dynamic column letters
  const approvedLetter = colLetter_(approvedCol);
  const reasonLetter   = colLetter_(reasonCol);
  const wholeRow = sheet.getRange("A2:" + reasonLetter + "1000");

  // Clear old rules first to avoid duplicates on re-runs
  sheet.setConditionalFormatRules([]);

  const approvedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${approvedLetter}2="${APPROVED_HEADER}"`)
    .setBackground("#d6ead3")
    .setRanges([wholeRow])
    .build();
  const deniedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$${approvedLetter}2="Denied"`)
    .setBackground("#f4cccc")
    .setRanges([wholeRow])
    .build();
  const pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($A2<>"",$${approvedLetter}2="")`)
    .setBackground("#fff2cc")
    .setRanges([wholeRow])
    .build();
  sheet.setConditionalFormatRules([approvedRule, deniedRule, pendingRule]);
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
