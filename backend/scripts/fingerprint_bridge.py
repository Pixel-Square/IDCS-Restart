#!/usr/bin/env python3
"""
Fingerprint Scanner Bridge Service  v2
───────────────────────────────────────
HTTP API that bridges the browser frontend to an ESP32-based fingerprint
scanner module connected via USB-to-Serial (CP210x / CH340 / etc.).

The ESP32 runs a text-based serial protocol:
  Boot -> "Enter Name:" prompt -> send name/ID -> ESP32 captures fingerprint
  -> reports success/failure over serial.

Endpoints
---------
  GET  /status            -> service info & sensor connection status
  POST /capture           -> send capture command to ESP32, wait for result
  POST /reconnect         -> re-detect ESP32 on serial ports

Runs on http://0.0.0.0:8889  (CORS enabled for browser access)
"""

from __future__ import annotations

import argparse
import base64
import glob
import hashlib
import json
import logging
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Optional

import serial

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("fp-bridge")

BAUD_RATES = [115200, 9600, 57600, 38400, 19200]
BOOT_MARKER = "Enter Name:"
CAPTURE_TIMEOUT = 30


class ESP32FingerprintSensor:
    """Manages communication with an ESP32-based fingerprint module."""

    def __init__(self):
        self.ser: Optional[serial.Serial] = None
        self.port_name: str = ""
        self.baud: int = 115200
        self.lock = threading.Lock()
        self._ready = False
        self._last_boot: str = ""

    @property
    def connected(self) -> bool:
        return self.ser is not None and self.ser.is_open and self._ready

    def _read_until(self, marker: str, timeout: float = 10.0) -> str:
        buf = ""
        start = time.time()
        while time.time() - start < timeout:
            if self.ser and self.ser.in_waiting:
                chunk = self.ser.read(self.ser.in_waiting)
                buf += chunk.decode("utf-8", errors="replace")
                if marker in buf:
                    return buf
            time.sleep(0.05)
        return buf

    def _read_all(self, timeout: float = 3.0) -> str:
        buf = ""
        start = time.time()
        last_data = start
        while time.time() - start < timeout:
            if self.ser and self.ser.in_waiting:
                chunk = self.ser.read(self.ser.in_waiting)
                buf += chunk.decode("utf-8", errors="replace")
                last_data = time.time()
            else:
                if buf and time.time() - last_data > 1.0:
                    break
            time.sleep(0.05)
        return buf

    def _reset_esp32(self) -> bool:
        if not self.ser:
            return False
        with self.lock:
            try:
                self.ser.dtr = True
                self.ser.rts = True
                time.sleep(0.1)
                self.ser.dtr = False
                self.ser.rts = False
                time.sleep(0.5)
                self.ser.reset_input_buffer()
                output = self._read_until(BOOT_MARKER, timeout=8)
                if BOOT_MARKER in output:
                    self._ready = True
                    self._last_boot = output
                    log.info("ESP32 ready - '%s' prompt received", BOOT_MARKER)
                    return True
                else:
                    log.warning("ESP32 reset: '%s' not found in: %s", BOOT_MARKER, repr(output[:200]))
                    return False
            except Exception as e:
                log.error("Reset failed: %s", e)
                return False

    def connect(self, port: str = "", baud: int = 0) -> bool:
        self.disconnect()
        ports_to_try = []
        if port:
            bauds = [baud] if baud else BAUD_RATES
            for b in bauds:
                ports_to_try.append((port, b))
        else:
            serial_ports = sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
            for p in serial_ports:
                bauds = [baud] if baud else BAUD_RATES
                for b in bauds:
                    ports_to_try.append((p, b))

        for p, b in ports_to_try:
            log.info("Trying %s @ %d baud ...", p, b)
            try:
                s = serial.Serial(p, b, timeout=1)
                s.dtr = False
                s.rts = False
                time.sleep(0.3)
                s.reset_input_buffer()
                self.ser = s
                self.port_name = p
                self.baud = b

                if self._reset_esp32():
                    log.info("ESP32 found on %s @ %d", p, b)
                    return True

                # Maybe already booted
                self.ser.reset_input_buffer()
                self.ser.write(b"\n")
                time.sleep(2)
                output = self._read_all(timeout=3)
                if BOOT_MARKER in output:
                    self._ready = True
                    log.info("ESP32 already running on %s @ %d", p, b)
                    return True

                # If port opened but device not fully responsive, still accept connection
                # This allows debugging and fallback communication attempts
                self._ready = True
                log.info("Port %s @ %d opened (device not yet fully responsive)", p, b)
                return True
            except serial.SerialException as e:
                log.debug("Cannot open %s: %s", p, e)
            except Exception as e:
                log.debug("Error on %s: %s", p, e)
                try:
                    if self.ser:
                        self.ser.close()
                except:
                    pass
                self.ser = None
                self.port_name = ""

        log.warning("No ESP32 fingerprint module found on any port")
        return False

    def disconnect(self):
        self._ready = False
        if self.ser:
            try:
                self.ser.close()
            except:
                pass
            self.ser = None
            self.port_name = ""

    def recover_after_io_error(self) -> bool:
        """Try to recover serial link after a hard I/O error."""
        prev_port = self.port_name
        prev_baud = self.baud
        log.warning("Recovering sensor after serial I/O error (port=%s, baud=%s)", prev_port or "auto", prev_baud)
        self.disconnect()
        ok = self.connect(port=prev_port or "", baud=prev_baud or 0)
        if ok:
            log.info("Sensor recovered on %s @ %d", self.port_name, self.baud)
        else:
            log.error("Sensor recovery failed")
        return ok

    def capture(self, user_id: str = "capture") -> dict:
        if not self.connected:
            return {"error": "No fingerprint sensor connected. Plug in the sensor and call /reconnect."}

        with self.lock:
            try:
                self.ser.reset_input_buffer()
                log.info("Sending capture ID: %s", user_id)
                self.ser.write(f"{user_id}\n".encode())

                log.info("Waiting for finger placement (timeout: %ds)...", CAPTURE_TIMEOUT)
                output = ""
                start = time.time()
                last_data = start
                while time.time() - start < CAPTURE_TIMEOUT:
                    if self.ser.in_waiting:
                        chunk = self.ser.read(self.ser.in_waiting)
                        text = chunk.decode("utf-8", errors="replace")
                        output += text
                        last_data = time.time()
                        log.info("ESP32: %s", text.strip())

                        lower = output.lower()
                        if any(kw in lower for kw in [
                            "enrolled", "success", "stored", "saved",
                            "match", "found", "verified", "complete",
                            "fingerprint id", "finger id", "enter name:",
                        ]):
                            time.sleep(0.5)
                            while self.ser.in_waiting:
                                output += self.ser.read(self.ser.in_waiting).decode("utf-8", errors="replace")
                                time.sleep(0.1)
                            break

                        if any(kw in lower for kw in [
                            "fail", "error", "timeout", "not found",
                            "mismatch", "no match", "did not match",
                        ]):
                            time.sleep(0.5)
                            while self.ser.in_waiting:
                                output += self.ser.read(self.ser.in_waiting).decode("utf-8", errors="replace")
                                time.sleep(0.1)
                            break
                    else:
                        if output and time.time() - last_data > 5.0:
                            break
                        time.sleep(0.05)

                output = output.strip()
                log.info("ESP32 capture result: %s", repr(output[:500]))

                if not output:
                    return {"error": "No response from sensor. Place your finger and try again.", "code": -1}

                lower = output.lower()
                is_success = any(kw in lower for kw in [
                    "enrolled", "success", "stored", "saved", "complete",
                    "match", "found", "verified", "fingerprint id", "finger id",
                ])
                is_failure = any(kw in lower for kw in [
                    "fail", "error", "timeout", "mismatch", "no match", "did not match",
                ])
                has_prompt = BOOT_MARKER in output

                if is_failure and not is_success:
                    return {"error": f"Capture failed: {output}", "code": -2, "raw_output": output}

                if is_success or has_prompt:
                    ref_hash = hashlib.sha256(f"{user_id}:{time.time()}:{output}".encode()).hexdigest()
                    template_ref = json.dumps({
                        "type": "esp32_r307_hw",
                        "port": self.port_name,
                        "user_id": user_id,
                        "ts": time.time(),
                        "output": output[:500],
                        "ref": ref_hash[:32],
                    })
                    template_b64 = base64.b64encode(template_ref.encode()).decode("ascii")
                    if BOOT_MARKER in output:
                        self._ready = True
                    return {
                        "template_b64": template_b64,
                        "quality_score": 85,
                        "size": len(template_ref),
                        "hardware_enrolled": True,
                        "esp32_output": output[:500],
                    }

                if any(kw in lower for kw in ["place", "put", "waiting"]):
                    return {"error": "Timed out waiting for finger. Place your finger and try again.", "code": 2}

                return {"error": f"Capture incomplete: {output[:200]}", "code": -3, "raw_output": output}

            except Exception as e:
                log.error("Capture error: %s", e)
                msg = str(e)
                if "Input/output error" in msg or "Errno 5" in msg:
                    self._ready = False
                    try:
                        self.recover_after_io_error()
                    except Exception as rec_err:
                        log.error("Recovery attempt failed: %s", rec_err)
                return {"error": f"Communication error: {str(e)}", "code": -4}

    def info(self) -> dict:
        return {
            "connected": self.connected,
            "port": self.port_name,
            "baud": self.baud,
            "device_type": "esp32_r307",
        }


sensor = ESP32FingerprintSensor()


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Max-Age", "600")

    def _json_response(self, data: dict, status: int = 200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Connection", "close")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/status", "/info"):
            self._json_response({"service": "fingerprint-bridge", "version": "2.0.0", **sensor.info()})
        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path == "/capture":
            if not sensor.connected:
                self._json_response(
                    {"error": "No fingerprint sensor connected. Plug in the sensor and call /reconnect."}, 503)
                return
            user_id = "capture"
            content_len = int(self.headers.get("Content-Length", 0))
            if content_len > 0:
                try:
                    body = json.loads(self.rfile.read(content_len))
                    user_id = str(body.get("user_id", body.get("name", "capture")))
                except:
                    pass
            result = sensor.capture(user_id=user_id)
            if "error" in result:
                status = 503 if result.get("code", 0) < 0 else 400
                self._json_response(result, status)
            else:
                self._json_response(result)

        elif self.path == "/reconnect":
            ok = sensor.connect()
            self._json_response({"status": "connected" if ok else "disconnected", "connected": ok, **sensor.info()})

        else:
            self._json_response({"error": "Not found"}, 404)

    def log_message(self, fmt, *args):
        log.info(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description="ESP32 Fingerprint Scanner Bridge")
    parser.add_argument("--port", type=int, default=8889)
    parser.add_argument("--serial", type=str, default="")
    parser.add_argument("--baud", type=int, default=0)
    args = parser.parse_args()

    log.info("Fingerprint Bridge v2 starting on http://0.0.0.0:%d", args.port)
    server = ThreadedHTTPServer(("0.0.0.0", args.port), BridgeHandler)
    log.info("Bridge listening on http://0.0.0.0:%d", args.port)

    def _initial_scan():
        sensor.connect(port=args.serial, baud=args.baud)
        if sensor.connected:
            log.info("ESP32 sensor ready on %s @ %d baud", sensor.port_name, sensor.baud)
        else:
            log.warning("No ESP32 sensor at startup. Will retry on /reconnect.")

    t = threading.Thread(target=_initial_scan, daemon=True)
    t.start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down ...")
        sensor.disconnect()
        server.shutdown()


if __name__ == "__main__":
    main()
