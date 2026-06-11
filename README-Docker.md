# Workforce Dashboard Docker

## Build image
```bash
docker build -t workforce-dashboard .
```

## Run container
```bash
docker run --env-file .env -p 5053:5053 --name workforce-dashboard workforce-dashboard
```

## Or use Docker Compose
```bash
docker compose up -d --build
```

App will be available at:
```txt
http://localhost:5053
```

Make sure `server.js` uses `process.env.PORT || 5053`.
