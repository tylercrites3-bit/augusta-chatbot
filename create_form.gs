/**
 * Augusta Concierge — auto-builds the artist event submission form.
 * Paste into script.google.com, click Run, authorize, then check the logs for the URLs.
 */
function buildAugustaEventForm() {
  const form = FormApp.create("Submit an Elkins Arts Event");

  form
    .setDescription(
      "Help us promote your event through the Augusta Heritage Center concierge chatbot. " +
      "Submissions are reviewed before they appear in the bot."
    )
    .setCollectEmail(true)
    .setLimitOneResponsePerUser(false)
    .setAcceptingResponses(true);

  form
    .addTextItem()
    .setTitle("Event title")
    .setHelpText('e.g. "Watercolor Workshop: Wildflowers of Appalachia"')
    .setRequired(true);

  form
    .addTextItem()
    .setTitle("Your name or organization")
    .setHelpText("The artist, gallery, theater, or org hosting the event")
    .setRequired(true);

  form
    .addMultipleChoiceItem()
    .setTitle("Category")
    .setChoiceValues(["Workshop", "Concert", "Exhibition", "Performance", "Community", "Other"])
    .setRequired(true);

  form
    .addDateItem()
    .setTitle("Start date")
    .setRequired(true);

  form
    .addDateItem()
    .setTitle("End date")
    .setHelpText("Same as start date for one-day events")
    .setRequired(true);

  form
    .addTimeItem()
    .setTitle("Start time")
    .setRequired(true);

  form
    .addTextItem()
    .setTitle("Location")
    .setHelpText("Venue name and street address")
    .setRequired(true);

  form
    .addTextItem()
    .setTitle("Price")
    .setHelpText('e.g. "$15", "Free", "$22 adult / $15 student"')
    .setRequired(true);

  form
    .addParagraphTextItem()
    .setTitle("Description")
    .setHelpText("2–3 sentences. What is it, who is it for, what makes it special?")
    .setRequired(true);

  form
    .addTextItem()
    .setTitle("Your contact email")
    .setHelpText("Not shown publicly. We may follow up with questions.")
    .setRequired(true);

  // Link the form to a fresh Google Sheet for responses
  const ss = SpreadsheetApp.create("Augusta Concierge Events (responses)");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log("=== AUGUSTA CONCIERGE FORM CREATED ===");
  Logger.log("Public form URL (send to artists): " + form.getPublishedUrl());
  Logger.log("Edit form URL (for you):           " + form.getEditUrl());
  Logger.log("Linked spreadsheet URL:            " + ss.getUrl());
  Logger.log("======================================");
}
