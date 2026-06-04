// Chase Actions — Google Apps Script
// Triggered by a Slack slash command via this script's web app URL.
// Set SLACK_BOT_TOKEN in Project Settings > Script Properties before deploying.

function doPost(e) {
  try {
    const token = PropertiesService.getScriptProperties().getProperty("SLACK_BOT_TOKEN");
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const data = sheet.getDataRange().getValues();

    const headers = data[0];
    const rows = data.slice(1);

    const col = {
      actionNo:   headers.indexOf("Action No."),
      action:     headers.indexOf("Action"),
      owner:      headers.indexOf("Owner"),
      resolution: headers.indexOf("Resolution"),
      dueDate:    headers.indexOf("Due date"),
      status:     headers.indexOf("Status"),
    };

    // Filter rows where Status is not "Complete" and Action No. is not empty
    const openActions = rows.filter(row => {
      const status = row[col.status].toString().trim().toLowerCase();
      const hasAction = row[col.actionNo].toString().trim() !== "";
      return hasAction && status !== "complete";
    });

    if (openActions.length === 0) {
      return respond("✅ No open actions found — all done!");
    }

    const slackUsers = getSlackUsers(token);
    const chased = [];
    const notFound = [];

    openActions.forEach(row => {
      const ownersRaw = row[col.owner].toString().trim();
      if (!ownersRaw) return;

      splitOwners(ownersRaw).forEach(owner => {
        const userId = findSlackUser(slackUsers, owner);
        if (!userId) {
          notFound.push(owner);
          return;
        }
        sendDM(token, userId, buildMessage(row, col));
        chased.push(owner);
      });
    });

    let summary = `:white_check_mark: Chased ${chased.length} action(s).`;
    if (notFound.length > 0) {
      summary += `\n:warning: Could not find Slack users for: ${[...new Set(notFound)].join(", ")}`;
    }

    return respond(summary);

  } catch (err) {
    return respond(`:x: Error: ${err.message}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KNOWN_NAMES = [
  "Aparna Ganesan", "Robert Eyres", "Laura Reile", "Alex Caudill",
  "Jamie Sims", "Laerke Rasmussen", "Alexa Stein", "Davine Ittoo",
  "Januka Jeyakumar", "Martyna Ore"
];

function splitOwners(raw) {
  KNOWN_NAMES.forEach(name => { raw = raw.replace(name, `|${name}|`); });
  const parts = raw.split("|").map(p => p.trim()).filter(p => KNOWN_NAMES.includes(p));
  return parts.length > 0 ? parts : [raw.trim()];
}

function getSlackUsers(token) {
  const res = UrlFetchApp.fetch("https://slack.com/api/users.list", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return JSON.parse(res.getContentText()).members || [];
}

function findSlackUser(users, fullName) {
  for (const user of users) {
    const name = (user.profile || {}).real_name || (user.profile || {}).display_name || "";
    if (name.toLowerCase() === fullName.toLowerCase()) return user.id;
  }
  return null;
}

function buildMessage(row, col) {
  return `:bell: *Action Reminder*\n` +
    `*Action #${row[col.actionNo]}:* ${row[col.action]}\n` +
    `*Due Date:* ${row[col.dueDate] || "Not set"}\n` +
    `*Status:* ${row[col.status] || "Not set"}\n` +
    `*Resolution:* ${row[col.resolution] || "None provided"}\n` +
    `Please update the actions tracker with your latest progress.`;
}

function sendDM(token, userId, message) {
  UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", {
    method: "post",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    payload: JSON.stringify({ channel: userId, text: message })
  });
}

function respond(text) {
  return ContentService
    .createTextOutput(JSON.stringify({ response_type: "in_channel", text }))
    .setMimeType(ContentService.MimeType.JSON);
}
