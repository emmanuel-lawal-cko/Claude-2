import os
import gspread
from flask import Flask, request, jsonify
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from google.oauth2.service_account import Credentials

app = Flask(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

def get_sheet_data():
    creds = Credentials.from_service_account_file("credentials.json", scopes=SCOPES)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(os.environ["GOOGLE_SHEET_ID"]).sheet1
    return sheet.get_all_records()

def get_slack_user_id(slack_client, full_name):
    response = slack_client.users_list()
    for user in response["members"]:
        profile = user.get("profile", {})
        name = profile.get("real_name", "") or profile.get("display_name", "")
        if name.lower() == full_name.lower():
            return user["id"]
    return None

def build_message(row):
    return (
        f":bell: *Action Reminder*\n"
        f"*Action #{row['Action No.']}:* {row['Action']}\n"
        f"*Due Date:* {row['Due date'] or 'Not set'}\n"
        f"*Status:* {row['Status'] or 'Not set'}\n"
        f"*Resolution:* {row['Resolution'] or 'None provided'}\n"
        f"Please update the actions tracker with your latest progress."
    )

@app.route("/chase-actions", methods=["POST"])
def chase_actions():
    slack_client = WebClient(token=os.environ["SLACK_BOT_TOKEN"])

    rows = get_sheet_data()
    open_actions = [r for r in rows if r.get("Status", "").strip().lower() != "complete"]

    if not open_actions:
        return jsonify({"response_type": "in_channel", "text": "No open actions found."})

    chased = []
    not_found = []

    for row in open_actions:
        owner = row.get("Owner", "").strip()
        if not owner:
            continue

        user_id = get_slack_user_id(slack_client, owner)
        if not user_id:
            not_found.append(owner)
            continue

        try:
            slack_client.chat_postMessage(channel=user_id, text=build_message(row))
            chased.append(owner)
        except SlackApiError:
            not_found.append(owner)

    summary = f":white_check_mark: Chased {len(chased)} action(s)."
    if not_found:
        unique_not_found = list(set(not_found))
        summary += f"\n:warning: Could not find Slack users for: {', '.join(unique_not_found)}"

    return jsonify({"response_type": "in_channel", "text": summary})

if __name__ == "__main__":
    app.run(port=3000)
