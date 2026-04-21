#!/usr/bin/env python3
"""
Fingerprint Scanner Bridge Service  v3
───────────────────────────────────────
HTTP API that bridges the browser frontend to an ESP32-based fingerprint
scanner module connected via USB-to-Serial (CP210x / CH340 / etc.).

This version uses an explicit command protocol for ESP32 firmware:
  MODE:C            -> switch to enrollment mode
  MODE:M            -> switch to monitor mode
  ENROLL:<slot>:<user_id>
  SCAN

Endpoints
---------
  GET  /status            -> service info & sensor connection status
  POST /capture           -> enroll (normal user_id) or monitor scan (verify)
  POST /mode              -> force ESP32 mode C/M
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
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Optional

import serial

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("fp-bridge")

BAUD_RATES = [115200, 57600, 9600, 38400, 19200]
READY_MARKERS = ["Waiting Command", "READY", "MONITOR MODE", "CAPTURE MODE"]
CAPTURE_TIMEOUT = 40
MONITOR_TIMEOUT = 12
MAX_SENSOR_SLOTS = 127
MODE_CHARS = {"C", "M"}
MAP_PATH = os.environ.get("FP_BRIDGE_MAP_PATH", "/tmp/fingerprint_bridge_map.json")
if MAP_PATH == "/tmp/fingerprint_bridge_map.json":
    MAP_PATH = os.path.join(os.path.dirname(__file__), "fingerprint_bridge_map.json")


class ESP32FingerprintSensor:
    """Manages communication with an ESP32-based fingerprint module."""

    def __init__(self):
        self.ser: Optional[serial.Serial] = None
        self.port_name: str = ""
        self.baud: int = 115200
        self.lock = threading.Lock()
        self._ready = False
        self.current_mode = "M"
        self.user_to_slot: dict[str, int] = {}
        self.slot_to_user: dict[str, str] = {}
        self._load_map()

    @property
    def connected(self) -> bool:
        return self.ser is not None and self.ser.is_open and self._ready

    def _load_map(self):
        try:
            if not os.path.exists(MAP_PATH):
                return
            with open(MAP_PATH, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self.user_to_slot = {
                str(k): int(v)
                for k, v in (data.get("user_to_slot") or {}).items()
                if str(v).isdigit()
            }
            self.slot_to_user = {
                str(k): str(v)
                for k, v in (data.get("slot_to_user") or {}).items()
                if str(k).isdigit() and str(v).strip()
            }
        except Exception as e:
            log.warning("Failed to load slot map: %s", e)

    def _save_map(self):
        try:
            map_dir = os.path.dirname(MAP_PATH)
            if map_dir:
                os.makedirs(map_dir, exist_ok=True)
            payload = {
                "user_to_slot": self.user_to_slot,
                "slot_to_user": self.slot_to_user,
                "updated_at": time.time(),
            }
            tmp = f"{MAP_PATH}.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
            os.replace(tmp, MAP_PATH)
        except Exception as e:
            log.warning("Failed to save slot map: %s", e)

    def _read_all(self, timeout: float = 2.0, idle_break: float = 0.8) -> str:
        buf = ""
        start = time.time()
        last_data = start
        while time.time() - start < timeout:
            if self.ser and self.ser.in_waiting:
                chunk = self.ser.read(self.ser.in_waiting)
                buf += chunk.decode("utf-8", errors="replace")
                last_data = time.time()
            else:
                if buf and time.time() - last_data > idle_break:
                    break
            time.sleep(0.05)
        return buf

    def _read_until_any(self, markers: list[str], timeout: float = 8.0) -> str:
        output = ""
        start = time.time()
        while time.time() - start < timeout:
            if self.ser and self.ser.in_waiting:
                output += self.ser.read(self.ser.in_waiting).decode("utf-8", errors="replace")
                lower = output.lower()
                if any(m.lower() in lower for m in markers):
                    break
            time.sleep(0.05)
        return output

    def _write_line(self, line: str):
        if not self.ser:
            return
        self.ser.write((line.strip() + "\n").encode("utf-8"))

    def _write_mode_char(self, mode: str):
        if not self.ser:
            return
        self.ser.write(mode.encode("ascii"))

    def _looks_ready(self, text: str) -> bool:
        lower = (text or "").lower()
        return any(m.lower() in lower for m in READY_MARKERS)

    def _probe_ready(self) -> bool:
        if not self.ser:
            return False
        try:
            self.ser.reset_input_buffer()
            self._write_line("PING")
            out = self._read_until_any(READY_MARKERS + ["PONG"], timeout=4)
            if self._looks_ready(out) or "pong" in out.lower():
                self._ready = True
                return True
            residual = self._read_all(timeout=1.5)
            combined = f"{out}\n{residual}".strip()
            if self._looks_ready(combined) or "pong" in combined.lower():
                self._ready = True
                return True
            if combined:
                log.info("Probe output did not match fingerprint-ready markers on %s: %s", self.port_name, repr(combined[:200]))
        except Exception as e:
            log.warning("Probe ready failed: %s", e)
        return False

    def _probe_protocol(self) -> bool:
        if not self.ser:
            return False
        try:
            self.ser.reset_input_buffer()
            self._write_line("MODE:M")
            out = self._read_until_any(["MONITOR MODE", "MODE:M", "READY", "UNKNOWN_CMD"], timeout=3.0)
            out += self._read_all(timeout=0.8)
            lower = out.lower()
            return ("monitor mode" in lower) or ("mode:m" in lower) or self._looks_ready(out)
        except Exception as e:
            log.warning("Protocol probe failed: %s", e)
            return False

    def _set_mode(self, mode: str, timeout: float = 3.0) -> bool:
        mode = str(mode or "").strip().upper()[:1]
        if mode not in MODE_CHARS:
            return False
        if not self.ser:
            return False
        target_marker = "CAPTURE MODE" if mode == "C" else "MONITOR MODE"
        target_mode_text = f"MODE:{mode}"

        def _mode_ok(text: str) -> bool:
            lower = (text or "").lower()
            return (target_marker.lower() in lower) or (target_mode_text.lower() in lower)

        try:
            # 1) Preferred protocol for current firmware: line command MODE:C / MODE:M
            self.ser.reset_input_buffer()
            self._write_line(target_mode_text)
            out = self._read_until_any(
                [target_marker, target_mode_text, "MODE:", "READY", "UNKNOWN_CMD", "ERROR"],
                timeout=timeout,
            )
            out += self._read_all(timeout=0.6)
            if _mode_ok(out):
                self.current_mode = mode
                log.info("ESP32 mode -> %s via line command; output=%s", mode, repr(out[:200]))
                return True

            # 2) Backward compatibility for older firmware: single-byte C / M
            self.ser.reset_input_buffer()
            self._write_mode_char(mode)
            out2 = self._read_until_any([target_marker, target_mode_text, "MODE:", "READY"], timeout=timeout)
            out2 += self._read_all(timeout=0.6)
            if _mode_ok(out2):
                self.current_mode = mode
                log.info("ESP32 mode -> %s via char fallback; output=%s", mode, repr(out2[:200]))
                return True

            log.warning("Failed to set mode %s; line_output=%s char_output=%s", mode, repr(out[:200]), repr(out2[:200]))
            return False
        except Exception as e:
            log.error("Failed to set mode %s: %s", mode, e)
            return False

    def _allocate_slot(self, user_id: str) -> Optional[int]:
        normalized = str(user_id or "").strip()
        if not normalized:
            return None

        existing = self.user_to_slot.get(normalized)
        if existing and 1 <= int(existing) <= MAX_SENSOR_SLOTS:
            return int(existing)

        used = {int(v) for v in self.user_to_slot.values() if isinstance(v, int)}
        for slot in range(1, MAX_SENSOR_SLOTS + 1):
            if slot not in used:
                self.user_to_slot[normalized] = slot
                self.slot_to_user[str(slot)] = normalized
                self._save_map()
                return slot
        return None

    @staticmethod
    def _extract_slot(output: str) -> Optional[int]:
        if not output:
            return None
        patterns = [
            r"\bslot\s*[:#-]\s*(\d{1,3})\b",
            r"\bmatch\s*[:#-]\s*(\d{1,3})\b",
            r"\bfinger(?:print)?\s*id\s*[:#-]\s*(\d{1,3})\b",
            r"\bid\s*[:#-]\s*(\d{1,3})\b",
        ]
        for pat in patterns:
            m = re.search(pat, output, flags=re.IGNORECASE)
            if m:
                try:
                    slot = int(m.group(1))
                    if 1 <= slot <= MAX_SENSOR_SLOTS:
                        return slot
                except Exception:
                    pass
        return None

    @staticmethod
    def _extract_user_from_output(output: str) -> str:
        if not output:
            return ""
        m = re.search(r"\buser\s*[:#-]\s*([A-Za-z0-9_-]{1,64})\b", output, flags=re.IGNORECASE)
        return str(m.group(1)).strip() if m else ""

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
                time.sleep(0.4)
                self.ser = s
                self.port_name = p
                self.baud = b

                if self._probe_ready() or self._probe_protocol():
                    self._ready = True
                    log.info("ESP32 found on %s @ %d", p, b)
                    return True

                log.info("Port %s @ %d did not respond to ESP32 protocol probe", p, b)

            except serial.SerialException as e:
                log.debug("Cannot open %s: %s", p, e)
            except Exception as e:
                log.debug("Error on %s: %s", p, e)
            finally:
                if self.ser and not self._ready:
                    try:
                        self.ser.close()
                    except Exception:
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
            except Exception:
                pass
            self.ser = None
            self.port_name = ""

    def recover_after_io_error(self) -> bool:
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

    def _build_esp32_template(self, user_id: str, output: str, slot: Optional[int], source: str) -> str:
        ref_hash = hashlib.sha256(f"{user_id}:{slot}:{source}:{output}".encode()).hexdigest()
        payload = {
            "type": "esp32_r307_hw",
            "source": source,
            "port": self.port_name,
            "user_id": str(user_id or "").strip(),
            "slot": slot,
            "output": (output or "")[:1000],
            "ref": ref_hash[:32],
            "ts": time.time(),
        }
        return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")

    def enroll(self, user_id: str) -> dict:
        if not self.connected:
            return {"error": "No fingerprint sensor connected. Plug in the sensor and call /reconnect."}

        normalized_user = str(user_id or "").strip()
        if not normalized_user:
            return {"error": "user_id is required for enrollment.", "code": 400}

        slot = self._allocate_slot(normalized_user)
        if not slot:
            return {"error": "No free fingerprint slots available in sensor mapping.", "code": 507}

        with self.lock:
            try:
                self._set_mode("C")
                self.ser.reset_input_buffer()
                cmd = f"ENROLL:{slot}:{normalized_user}"
                log.info("Sending %s", cmd)
                self._write_line(cmd)

                output = self._read_until_any(
                    ["ENROLL_OK", "ENROLLED", "Saved", "ENROLL_FAIL", "ERROR", "FAILED"],
                    timeout=CAPTURE_TIMEOUT,
                )
                output += self._read_all(timeout=2.0)
                output = output.strip()
                lower = output.lower()
                log.info("ESP32 enroll result: %s", repr(output[:500]))

                if not output:
                    return {"error": "No response from sensor during enrollment.", "code": -1}

                is_failure = any(k in lower for k in ["enroll_fail", "fail", "error", "timeout", "mismatch"])
                is_success = any(k in lower for k in ["enroll_ok", "enrolled", "saved", "stored", "success"])

                if is_failure and not is_success:
                    return {"error": f"Enrollment failed: {output}", "code": -2, "raw_output": output}

                if not is_success:
                    return {"error": f"Enrollment incomplete: {output[:300]}", "code": -3, "raw_output": output}

                self.user_to_slot[normalized_user] = slot
                self.slot_to_user[str(slot)] = normalized_user
                self._save_map()

                return {
                    "template_b64": self._build_esp32_template(normalized_user, output, slot, "enroll"),
                    "quality_score": 85,
                    "size": len(output),
                    "hardware_enrolled": True,
                    "esp32_output": output[:500],
                    "slot": slot,
                    "user_id": normalized_user,
                }
            except Exception as e:
                log.error("Enroll error: %s", e)
                msg = str(e)
                if "Input/output error" in msg or "Errno 5" in msg:
                    self._ready = False
                    try:
                        self.recover_after_io_error()
                    except Exception as rec_err:
                        log.error("Recovery attempt failed: %s", rec_err)
                return {"error": f"Communication error: {msg}", "code": -4}

    def monitor_scan(self) -> dict:
        if not self.connected:
            return {"error": "No fingerprint sensor connected. Plug in the sensor and call /reconnect."}

        with self.lock:
            try:
                self._set_mode("M")
                self.ser.reset_input_buffer()
                self._write_line("SCAN")

                output = self._read_until_any(
                    ["MATCH", "NO_MATCH", "NOT FOUND", "NO ENTRY", "ERROR", "TIMEOUT"],
                    timeout=MONITOR_TIMEOUT,
                )
                output += self._read_all(timeout=1.2)
                output = output.strip()
                lower = output.lower()
                log.info("ESP32 monitor result: %s", repr(output[:500]))

                if not output:
                    return {"error": "No response from sensor during monitor scan.", "code": -1}

                if any(k in lower for k in ["no_match", "not found", "no entry"]):
                    return {"error": "No matching fingerprint found on sensor.", "code": 404, "raw_output": output}
                if any(k in lower for k in ["error", "fail", "timeout"]):
                    return {"error": f"Monitor failed: {output}", "code": -2, "raw_output": output}

                slot = self._extract_slot(output)
                mapped_user = self.slot_to_user.get(str(slot), "") if slot else ""
                if not mapped_user:
                    mapped_user = self._extract_user_from_output(output)

                return {
                    "template_b64": self._build_esp32_template(mapped_user, output, slot, "monitor"),
                    "quality_score": 80,
                    "hardware_enrolled": True,
                    "esp32_output": output[:500],
                    "slot": slot,
                    "user_id": mapped_user,
                }
            except Exception as e:
                log.error("Monitor scan error: %s", e)
                msg = str(e)
                if "Input/output error" in msg or "Errno 5" in msg:
                    self._ready = False
                    try:
                        self.recover_after_io_error()
                    except Exception as rec_err:
                        log.error("Recovery attempt failed: %s", rec_err)
                return {"error": f"Communication error: {msg}", "code": -4}

    def capture(self, user_id: str = "capture") -> dict:
        mode_hint = str(user_id or "").strip().lower()
        if mode_hint in {"verify", "monitor", "scan"}:
            return self.monitor_scan()
        return self.enroll(user_id=user_id)

    def set_mode(self, mode: str) -> dict:
        if not self.connected:
            return {"error": "No fingerprint sensor connected. Plug in the sensor and call /reconnect."}

        m = str(mode or "").strip().upper()[:1]
        if m not in MODE_CHARS:
            return {"error": "Invalid mode. Use 'C' or 'M'.", "code": 400}

        with self.lock:
            ok = self._set_mode(m)
        if not ok:
            return {"error": "Failed to switch mode.", "code": 500}
        return {"ok": True, "mode": m}

    def info(self) -> dict:
        return {
            "connected": self.connected,
            "port": self.port_name,
            "baud": self.baud,
            "mode": self.current_mode,
            "device_type": "esp32_r307",
            "mapped_users": len(self.user_to_slot),
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

    def _read_json_body(self) -> dict:
        content_len = int(self.headers.get("Content-Length", 0))
        if content_len <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(content_len))
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/status", "/info"):
            self._json_response({"service": "fingerprint-bridge", "version": "3.0.0", **sensor.info()})
        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path == "/capture":
            if not sensor.connected:
                self._json_response(
                    {"error": "No fingerprint sensor connected. Plug in the sensor and call /reconnect."},
                    503,
                )
                return

            body = self._read_json_body()
            user_id = str(body.get("user_id", body.get("name", "capture"))).strip() or "capture"
            result = sensor.capture(user_id=user_id)
            if "error" in result:
                code = int(result.get("code", 0) or 0)
                status = 404 if code == 404 else (503 if code < 0 else 400)
                self._json_response(result, status)
            else:
                self._json_response(result)
            return

        if self.path == "/mode":
            body = self._read_json_body()
            mode = str(body.get("mode", "")).strip()
            result = sensor.set_mode(mode)
            if "error" in result:
                status = 503 if result.get("code", 0) >= 500 else 400
                self._json_response(result, status)
            else:
                self._json_response(result)
            return

        if self.path == "/reconnect":
            ok = sensor.connect()
            self._json_response({"status": "connected" if ok else "disconnected", "connected": ok, **sensor.info()})
            return

        self._json_response({"error": "Not found"}, 404)

    def log_message(self, fmt, *args):
        log.info(fmt, *args)


def main():
    parser = argparse.ArgumentParser(description="ESP32 Fingerprint Scanner Bridge")
    parser.add_argument("--port", type=int, default=8889)
    parser.add_argument("--serial", type=str, default="")
    parser.add_argument("--baud", type=int, default=0)
    args = parser.parse_args()

    log.info("Fingerprint Bridge v3 starting on http://0.0.0.0:%d", args.port)
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
