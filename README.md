# 🏠 AmaDeCasa Backend

**AmaDeCasa** es el sistema doméstico inteligente que gestiona solicitudes, productos y automatizaciones del hogar.  
Este repositorio contiene el **backend (API REST)** basado en **Node.js + Express + MariaDB**, diseñado para ejecutarse fácilmente **en un solo contenedor Docker**.

---

## 🚀 Características

- API REST modular con **Express.js**
- Base de datos **MariaDB** embebida en el mismo contenedor
- **Autenticación JWT** con cookies HttpOnly
- Middleware de **autorización por roles**
- Soporte para exportación de datos
- **Pruebas automáticas** con Vitest
- **Servidor único autocontenido** (API + DB)

---

## 🧩 Estructura del proyecto

amadecasa-backend/
├── api/
│ ├── routes/
│ │ ├── auth.js
│ │ ├── requests.js
│ │ └── users.js
│ ├── db.js
│ ├── auth-mw.js
│ ├── app.js
│ └── server.js
├── tests/
│ ├── auth.test.js
│ └── requests.authz.test.js
├── .env
├── package.json
├── Dockerfile
└── README.md

---

## ⚙️ Requisitos

Solo necesitas tener instalado:

- **Docker**
- **Docker Compose (opcional)**

Todo lo demás (Node.js, MariaDB, dependencias, configuración) se incluye dentro del contenedor.

---

## 🧰 Variables de entorno (`.env`)

Crea un archivo `.env` en el directorio raíz:

```env
PORT=3001
JWT_SECRET=supersecreto
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=amadepass
DB_NAME=amadecasa
DB_PORT=3306
NODE_ENV=production
🐳 Dockerfile — Contenedor único (API + MariaDB)

Este Dockerfile construye un solo contenedor unificado que ejecuta tanto la API Node.js como MariaDB, utilizando supervisord para manejar ambos servicios de forma estable.

# Imagen base con Node y MariaDB
FROM ubuntu:22.04

# Variables globales
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20.11.1
ENV MYSQL_ROOT_PASSWORD=amadepass
ENV DB_NAME=amadecasa
ENV PORT=3001

# Actualizar e instalar dependencias
RUN apt-get update && \
    apt-get install -y curl gnupg lsb-release supervisor mariadb-server && \
    rm -rf /var/lib/apt/lists/*

# Instalar Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && npm install -g npm@latest

# Crear directorios
WORKDIR /app
COPY . /app

# Instalar dependencias del backend
RUN npm install --omit=dev

# Configurar MariaDB inicial
RUN service mariadb start && \
    mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};" && \
    mysql -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${MYSQL_ROOT_PASSWORD}';" && \
    mysql -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;" && \
    mysql -e "FLUSH PRIVILEGES;"

# Copiar configuración de supervisor
RUN mkdir -p /var/log/supervisor
COPY supervisor.conf /etc/supervisor/conf.d/supervisor.conf

EXPOSE 3001 3306

# Comando principal
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisor.conf"]

⚙️ Configuración de supervisor.conf

Crea un archivo llamado supervisor.conf junto al Dockerfile:

[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log

[program:mariadb]
command=/usr/sbin/mysqld
autostart=true
autorestart=true
priority=5

[program:amadecasa-api]
directory=/app
command=node api/server.js
autostart=true
autorestart=true
priority=10
stdout_logfile=/var/log/supervisor/api.log
stderr_logfile=/var/log/supervisor/api.err

▶️ Construcción y ejecución

1️⃣ Construir la imagen

docker build -t amadecasa-backend:latest .


2️⃣ Ejecutar el contenedor

docker run -d \
  --name amadecasa \
  -p 3001:3001 \
  -p 3306:3306 \
  --env-file .env \
  amadecasa-backend:latest


3️⃣ Ver logs

docker logs -f amadecasa

📡 Endpoints principales
🔑 Autenticación

POST /api/auth/login – Inicia sesión (crea cookie JWT)

GET /api/auth/status – Verifica sesión

POST /api/auth/logout – Cierra sesión

📦 Solicitudes

GET /api/requests – Lista solicitudes (rol admin)

POST /api/requests – Crea nueva solicitud

GET /api/requests/export – Exporta a CSV (rol admin)

👥 Usuarios

GET /api/users – Lista usuarios

POST /api/users – Crea usuario

🧪 Pruebas

Ejecuta los tests dentro del contenedor:

docker exec -it amadecasa npm test


Ejemplo de salida:

✓ Auth API (1)
✓ Requests API - autorización (2)
GET /api/requests sin cookie → 401 (no autenticado)

🔐 Seguridad

Cookies seguras HttpOnly y SameSite

JWT firmados con JWT_SECRET

Middleware para roles (requireAdmin, requireAssist, requireGuest)

Puerto 3306 expuesto solo si necesitas conectar externamente

🌐 Integración con frontend

El frontend AmaDeCasa (React) debe apuntar a:

http://<IP_DEL_SERVIDOR>:3001/api/


Ejemplo en .env del frontend:

VITE_API_URL=http://192.168.0.100:3001/api/

🧠 Tecnologías

Node.js 20

Express.js

MariaDB

JWT + bcrypt

Vitest

Supervisor (multi-servicio)

Docker unificado

🧑‍💻 Autor

Johan González
📍 Costa Rica
💡 Desarrollador full-stack — Creador del ecosistema AmaDeCasa

📄 Licencia

Este proyecto está bajo la licencia MIT.
Puedes usarlo, modificarlo y distribuirlo libremente con atribución.

❤️ “AmaDeCasa: la tecnología al servicio del hogar inteligente.”