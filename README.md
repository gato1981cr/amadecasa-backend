# AmaDeCasa Backend

Microservicio base en **Python + FastAPI**, diseñado bajo principios **S.O.L.I.D.**  
y preparado para correr en contenedores **Docker** dentro del entorno Ubuntu Server.

## 🚀 Tecnologías
- Python 3.12
- FastAPI + Uvicorn
- Docker / Docker Compose
- GitHub para control de versiones

## 🧩 Estructura
app/
├─ main.py # Punto de entrada
├─ controllers/ # Endpoints REST
├─ domain/ # Interfaces (puertos)
├─ infra/ # Implementaciones (adaptadores)
└─ di.py # Inyección de dependencias


## ⚙️ Ejecución local
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
Ejecución con Docker
docker compose up --build


Accede a la documentación interactiva:
http://localhost:8000/docs