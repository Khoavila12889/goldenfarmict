"""Private formula print agent for a dedicated Windows factory PC.

Images are fetched from the backend directly into memory and submitted to the
Windows printer spooler. The browser only creates/observes a print job.
"""

from __future__ import annotations

import argparse
import configparser
import io
import logging
import time
from pathlib import Path

import requests
from PIL import Image, ImageWin


LOG = logging.getLogger("formula-print-agent")


def load_config(path: Path) -> dict[str, str]:
    config = configparser.ConfigParser()
    if not config.read(path, encoding="utf-8"):
        raise RuntimeError(f"Cannot read configuration: {path}")
    values = config["agent"]
    api_base = values.get("api_base", "").rstrip("/")
    station_id = values.get("station_id", "factory-main").strip()
    agent_key = values.get("agent_key", "").strip()
    if not api_base.startswith("https://"):
        raise RuntimeError("api_base must use HTTPS")
    if not station_id or not agent_key or agent_key == "CHANGE_ME":
        raise RuntimeError("Set station_id and agent_key in the local config")
    return {"api_base": api_base, "station_id": station_id, "agent_key": agent_key}


def print_images(images: list[Image.Image], job_name: str) -> None:
    if not images:
        raise RuntimeError("No pages in print job")

    import win32con
    import win32gui
    import win32print
    import win32ui

    printer_name = win32print.GetDefaultPrinter()
    printer_handle = win32print.OpenPrinter(printer_name)
    try:
        printer_info = win32print.GetPrinter(printer_handle, 2)
        devmode = printer_info["pDevMode"]
        devmode.Fields |= win32con.DM_ORIENTATION
        devmode.Orientation = (
            win32con.DMORIENT_LANDSCAPE if images[0].width > images[0].height
            else win32con.DMORIENT_PORTRAIT
        )
        printer_dc = win32gui.CreateDC("WINSPOOL", printer_name, None, devmode)
    finally:
        win32print.ClosePrinter(printer_handle)

    dc = win32ui.CreateDCFromHandle(printer_dc)
    try:
        printable_width = dc.GetDeviceCaps(win32con.HORZRES)
        printable_height = dc.GetDeviceCaps(win32con.VERTRES)
        dc.StartDoc(job_name[:128])
        try:
            for image in images:
                page = image.convert("RGB")
                scale = min(printable_width / page.width, printable_height / page.height)
                width = int(page.width * scale)
                height = int(page.height * scale)
                left = (printable_width - width) // 2
                top = (printable_height - height) // 2
                dc.StartPage()
                try:
                    ImageWin.Dib(page).draw(
                        dc.GetHandleOutput(),
                        (left, top, left + width, top + height),
                    )
                finally:
                    dc.EndPage()
            dc.EndDoc()
        except Exception:
            dc.AbortDoc()
            raise
    finally:
        dc.DeleteDC()


def request_headers(agent_key: str) -> dict[str, str]:
    return {"X-Formula-Print-Agent-Key": agent_key}


def process_job(session: requests.Session, config: dict[str, str], job: dict) -> None:
    api_base = config["api_base"]
    headers = request_headers(config["agent_key"])
    job_id = int(job["job_id"])
    images: list[Image.Image] = []
    try:
        if job.get("status") == "failed":
            LOG.error("Job %s rejected: %s", job_id, job.get("error", "unknown error"))
            return

        for page_number in range(1, int(job["page_count"]) + 1):
            response = session.get(
                f"{api_base}/formulas/agent/print-jobs/{job_id}/pages/{page_number}",
                headers=headers,
                timeout=90,
            )
            response.raise_for_status()
            with Image.open(io.BytesIO(response.content)) as image:
                image.load()
                images.append(image.convert("RGB"))

        print_images(images, f"Formula {job.get('recipe_code', job_id)}")
        finish_status = "completed"
        error = ""
        LOG.info("Job %s submitted to the Windows print queue", job_id)
    except Exception as exc:
        finish_status = "failed"
        error = str(exc)[:500]
        LOG.exception("Print job %s failed", job_id)
    finally:
        for image in images:
            image.close()

    try:
        session.post(
            f"{api_base}/formulas/agent/print-jobs/{job_id}/finish",
            params={"status": finish_status, "error": error},
            headers=headers,
            timeout=30,
        ).raise_for_status()
    except Exception:
        LOG.exception("Could not acknowledge print job %s", job_id)


def run(config: dict[str, str]) -> None:
    session = requests.Session()
    headers = request_headers(config["agent_key"])
    claim_url = f"{config['api_base']}/formulas/agent/print-jobs/claim"
    while True:
        try:
            response = session.post(
                claim_url,
                params={"station_id": config["station_id"]},
                headers=headers,
                timeout=35,
            )
            if response.status_code == 204:
                time.sleep(2)
                continue
            response.raise_for_status()
            process_job(session, config, response.json())
        except KeyboardInterrupt:
            LOG.info("Print agent stopped")
            return
        except Exception:
            LOG.exception("Print agent connection/processing error")
            time.sleep(5)


def main() -> None:
    parser = argparse.ArgumentParser(description="GoldenFarm formula print agent")
    parser.add_argument("--config", default="agent.ini", help="Path to local agent.ini")
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler()],
    )
    run(load_config(Path(args.config)))


if __name__ == "__main__":
    main()
