# Workforce Monitoring System

## Run with Docker

### Requirements

- Docker Desktop
- The project `.env` file
- Access to the Workforce PostgreSQL network

### First Run

1. Start Docker Desktop.
2. Open PowerShell inside the project folder.
3. Run:

```powershell
docker compose up -d --build
```

4. Wait for both containers to start:

```powershell
docker compose ps
```

5. Open the application:

```text
http://localhost:5056
```

Other computers on the same network can open:

```text
http://YOUR-PC-IP:5056
```

### Database

No SQL setup is required when the Workforce PostgreSQL database already exists.

The application uses the database connection in `.env` and automatically creates:

- `app.workforceupdate`
- `app."workforce-logs"`

The configured database user must have permission to create the `app` schema, tables, and indexes.

Docker does not create the PostgreSQL server or the main database. If the database does not exist yet, ask the database administrator to create it and provide the connection details for `.env`.

### Start Again

```powershell
docker compose up -d
```

### Stop

```powershell
docker compose down
```

### Rebuild After Receiving Updated Files

```powershell
docker compose up -d --build
```

### Check Status

```powershell
docker compose ps
docker compose logs --tail=100
```

The application is ready when `workforce-app` and `workforce-nginx` both show `Up`.
