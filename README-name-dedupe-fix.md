# Workforce name dedupe + last scan fix

Replace your project `server.js` with this `server.js`.

Fixes:
- Same Person name now appears only once, even if `PersonGroup` / subgroup or `L_UID` is different.
- Daily Record uses the latest actual scan for that name across duplicate records.
- Keeps the existing "No Scan" behavior for people who have only one scan in the active 6 AM to 6 AM workforce window.

After replacing:

```powershell
npm run build
node server.js
```

For Docker:

```powershell
docker build --no-cache -t workforce-dashboard .
docker rm -f workforce-dashboard
docker run --env-file .env -p 5056:5056 --name workforce-dashboard workforce-dashboard
```
