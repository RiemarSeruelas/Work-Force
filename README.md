# Workforce Monitoring System

The Workforce Monitoring System helps authorized personnel review workforce presence, working hours, attendance patterns, and population distribution across the site. It brings personnel-scan information into one dashboard so users can quickly identify long working hours, missing time-out records, and possible compliance concerns.

## Who Should Use This Dashboard

- Site leaders and operations managers
- Human resources and workforce administrators
- Safety, health, and environment personnel
- Authorized personnel responsible for workforce monitoring and compliance

## Main Features

- Live workforce and personnel-scan monitoring
- Current workforce totals and latest-scan information
- Daily IN and OUT record review
- Working-hours compliance monitoring
- Working-days compliance monitoring
- Long-hours indicators for more than 8, 10, and 12 hours
- Workforce population summaries
- Site and area population map
- Search and workforce filtering
- Automatic data refresh
- Passcode-protected access
- Database-backed application usage logging
- Background data preparation while the sign-in page is open

## Dashboard Pages

| Page | Purpose |
| --- | --- |
| **Overview** | View current workforce totals, the latest scan, and important working-hours indicators. |
| **Daily Record** | Review personnel IN and OUT activity and calculated working time for a selected workforce day. |
| **Compliance** | Review working-hours and working-days compliance information for monitored personnel. |
| **Population** | View workforce totals and population summaries using the available filters. |
| **Map** | Review workforce distribution across the site's configured areas and departments. |

## How to Use the Dashboard

### 1. Sign In

Open the dashboard and enter the authorized passcode. While the sign-in page is open, the system begins preparing the dashboard data to reduce the waiting time after login.

### 2. Review the Overview

Use the Overview page to check the current workforce population, latest available scan, and long-hours indicators. The dashboard highlights personnel whose calculated working time has passed the configured monitoring thresholds.

### 3. Review Daily Records

Open Daily Record to review personnel scans and calculated work duration. Use search and the available filters to locate a specific person or group.

The workforce day runs from **06:00 until 05:59 the following calendar day**. Overnight activity is therefore included in the workforce day on which the shift began.

### 4. Check Compliance

Open Compliance to review possible working-hours and working-days concerns. Use the available workforce filters to narrow the results when required.

Treat dashboard results as monitoring indicators. Any compliance concern should be confirmed using the applicable company policy and official personnel records.

### 5. Review Population and Map Information

Use Population to review workforce totals and distribution. Open Map to see how the current workforce is distributed across the configured site areas.

Population and location information depends on the most recent qualifying personnel scan available to the system.

### 6. Refresh or Recheck the Data

The dashboard refreshes automatically. Newly received scans may take a short time to appear because the source system and dashboard synchronize periodically.

## Important Rules

- The workforce day begins at **06:00** and ends at **05:59** the next day.
- Working duration is calculated from the available IN and OUT records.
- Missing, delayed, duplicated, or incorrect scans can affect the displayed result.
- A record without a valid time-out may be identified as **24H no out** or another missing-OUT condition.
- Long-hours indicators are monitoring alerts and should be operationally confirmed.
- Population and map results are based on the latest available scan and configured area mapping.
- Dashboard access and manual verification should be limited to authorized personnel.
- The dashboard uses Manila time.

## Reminders and Useful Facts

- The dashboard may open even when PostgreSQL is temporarily unavailable, but database-dependent information will not load until the connection is restored.
- No application restart is required when a temporary database connection becomes available again; the dashboard can retry its requests normally.
- Data is prepared while the sign-in screen is open, so the first dashboard page may load faster after a successful login.
- A newly received personnel scan may take a short time to appear because synchronization occurs periodically.
- Application visits are recorded in the PostgreSQL table `app."workforce-logs"` when usage logging is enabled.
- Without individual user accounts, the usage log identifies a visit using information such as the visitor's IP address, browser, device information, page, and browser session—not the person's actual name.

## Running the Dashboard with Docker

This section is for the person responsible for starting the dashboard computer.

### Requirements

- Docker Desktop
- The complete project folder, including `docker-compose.yml`
- A configured `.env` file provided by the system owner
- Network access to the PostgreSQL database used by the application
- The required PostgreSQL database and `app` schema

### Configure `.env`

Create `.env` in the main project folder and enter the deployment values provided by the system owner:

```env
DB_HOST=your_database_server
DB_PORT=your_database_port
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
PORT=your_app_port
APP_PORT=your_app_port
APP_PASSWORD=your_dashboard_passcode
USAGE_LOG_ENABLED=true
TZ=Asia/Manila
```

### Start the Application

Open PowerShell or Command Prompt in the main project folder, then run:

```powershell
docker compose up -d --build
```

The first build may require internet access so Docker can download the required images and packages. Normal starts can use the existing local images.

### Open the Dashboard

On the computer running Docker:

```text
http://localhost:your_app_port
```

From another computer on the same network:

```text
http://SERVER_IP:your_app_port
```

Replace `SERVER_IP` with the IP address of the computer running Docker and `your_app_port` with the configured application port.

### Check the Application

```powershell
docker compose ps
```

The Workforce application and Nginx services should show as running.

### Start Using Existing Docker Images

Use this for a normal start when the application images have already been built:

```powershell
docker compose up -d --no-build --pull never
```

### Rebuild After an Update

Use this after replacing application files or changing application code:

```powershell
docker compose down
docker compose up -d --build --force-recreate
```

### Apply Changes from `.env`

Use this after changing only the `.env` values:

```powershell
docker compose up -d --force-recreate --no-build
```

### Stop the Application

```powershell
docker compose down
```

## Basic Troubleshooting

### The Dashboard Does Not Open

Check whether the containers are running:

```powershell
docker compose ps
```

View the latest application messages:

```powershell
docker compose logs --tail=100
```

### The Dashboard Opens but Shows No Data

- Confirm that the dashboard computer is connected to the database network.
- Confirm that the PostgreSQL server is running and reachable.
- Confirm that the database values in `.env` are correct.
- Wait briefly, then refresh the page.

### New Scans Do Not Appear Immediately

- Confirm that the source personnel-scanning system is operating.
- Wait briefly for the source system and dashboard to synchronize.
- Confirm that the scan belongs to the selected workforce day.
- Check whether the person is excluded by the current search or filter.

### Docker Cannot Download an Image

The first build requires access to the internet. Connect the dashboard computer to a network with internet access, run the build, and then reconnect it to the database network before starting the application with the existing images.

### Database Connection Error

Contact the system owner or database administrator to verify the connection values in `.env` and confirm that the PostgreSQL database is reachable from the dashboard computer.

## Security

- Share the dashboard passcode only with authorized personnel.
- Keep the `.env` file and database credentials private.
- Do not expose PostgreSQL directly to untrusted networks.
- Restrict access to workforce records and usage logs to authorized personnel.
- Sign out when the dashboard is no longer being used.
