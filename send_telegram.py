import os, requests, sys
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID") or sys.argv[1]
text = " ".join(sys.argv[2:]) or "Hola desde AmaDeCasa 👋"
url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
r = requests.post(url, json={"chat_id": CHAT_ID, "text": text}, timeout=10)
r.raise_for_status()
print(r.json())
