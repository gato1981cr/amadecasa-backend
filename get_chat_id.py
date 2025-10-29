import os
import requests
token = os.getenv("TELEGRAM_BOT_TOKEN")
r = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=10)
print(r.json())
