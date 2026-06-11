# Docker usage

Build the image:

```bash
docker build -t workforce-dashboard .
```

Run the container:

```bash
docker run --env-file .env -p 5056:5056 --name workforce-dashboard workforce-dashboard
```

Open in browser:

```text
http://SERVER_IP:5056
```

To replace an existing container:

```bash
docker rm -f workforce-dashboard
docker run --env-file .env -p 5056:5056 --name workforce-dashboard workforce-dashboard
```
