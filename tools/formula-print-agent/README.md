# GoldenFarm Formula Print Agent

The agent runs on the Windows PC connected to the factory printer. It polls the API for jobs assigned to its `station_id`, downloads server-rendered PNG pages directly into memory, and submits them to the Windows default printer. The browser never receives the PDF or PNG pages.

## Configure the backend

Set a long random value in the backend environment:

```text
FORMULA_PRINT_AGENT_KEY=<random-secret>
FORMULA_PRINT_DPI=300
```

Generate the value locally with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Copy it into the backend environment and `agent.ini`; do not commit either value.

Restart only the backend service after configuration. Copy the same key into the local agent config. Do not put the agent key in frontend code or send it to users.

## Install on the printer PC

1. Install Python 3.11 for Windows and the driver for the target printer.
2. Set that printer as the Windows default printer and configure the desired paper size (normally A4).
3. Copy `agent.ini.example` to `agent.ini`, then set the HTTPS API URL, station ID, and agent key.
4. Install and start the agent:

   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   py agent.py --config agent.ini
   ```

5. Configure Task Scheduler to start the agent at Windows sign-in for the dedicated factory print account.

The browser's station ID must match the agent. The app uses `factory-main` by default; on a different station, set `localStorage.formula_print_station_id` to the matching ID once on that PC.

## Print flow and limits

The browser submits only the formula ID and polls job status. The agent retrieves raster pages from authenticated agent-only routes and calls the Windows printer driver. Windows may keep temporary spool data while a job is being processed; the app does not create a user-facing PDF/image download. Printer completion means the job was accepted by the Windows spooler, not that paper physically exited the device.
