#include <Adafruit_Fingerprint.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Preferences.h>

// OLED
Adafruit_SSD1306 display(128, 64, &Wire, -1);

// Fingerprint sensor (UART2)
HardwareSerial fpSerial(2);
Adafruit_Fingerprint finger(&fpSerial);

// Current mode
char currentMode = 'M'; // M = monitor, C = capture/enroll

// Clock since boot (for simple on-screen timestamp)
unsigned long startMillis = 0;
const int MIN_MONITOR_CONFIDENCE = 80;
Preferences preferences;

String slotKey(int slot) {
  return "s" + String(slot);
}

void saveSlotUser(int slot, const String &userId) {
  if (slot <= 0 || slot > 127) return;
  String key = slotKey(slot);
  preferences.putString(key.c_str(), userId);
}

String loadSlotUser(int slot) {
  if (slot <= 0 || slot > 127) return "";
  String key = slotKey(slot);
  return preferences.getString(key.c_str(), "");
}

void show(const String &l1, const String &l2 = "", const String &l3 = "") {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(l1);
  display.setCursor(0, 20);
  display.println(l2);
  display.setCursor(0, 40);
  display.println(l3);
  display.display();
}

String getUptime() {
  unsigned long sec = (millis() - startMillis) / 1000;
  char buf[12];
  sprintf(buf, "%02lu:%02lu:%02lu", sec / 3600, (sec % 3600) / 60, sec % 60);
  return String(buf);
}

void setMode(char m) {
  if (m != 'C' && m != 'M') return;
  currentMode = m;
  if (currentMode == 'C') {
    show("CAPTURE MODE", "Await ENROLL cmd");
    Serial.println("MODE:C");
  } else {
    show("MONITOR MODE", "Await SCAN cmd");
    Serial.println("MODE:M");
  }
}

bool waitForImage(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    int p = finger.getImage();
    if (p == FINGERPRINT_OK) return true;
    if (p == FINGERPRINT_PACKETRECIEVEERR || p == FINGERPRINT_IMAGEFAIL) {
      delay(50);
      continue;
    }
    delay(50);
  }
  return false;
}

bool waitFingerRemoved(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    int p = finger.getImage();
    if (p == FINGERPRINT_NOFINGER) return true;
    delay(50);
  }
  return false;
}

bool captureTemplate(uint8_t bufferId, uint32_t timeoutMs, const String &title, const String &subtitle, int tries) {
  for (int attempt = 1; attempt <= tries; attempt++) {
    show(title, subtitle, "Try " + String(attempt) + "/" + String(tries));

    if (!waitForImage(timeoutMs)) {
      continue;
    }

    int conv = finger.image2Tz(bufferId);
    if (conv == FINGERPRINT_OK) {
      return true;
    }

    show("Image Error", "Adjust finger", "Retrying...");
    waitFingerRemoved(2500);
    delay(200);
  }
  return false;
}

void doEnroll(int slot, const String &userId) {
  if (slot <= 0 || slot > 127) {
    Serial.println("ENROLL_FAIL:INVALID_SLOT");
    show("Enroll Failed", "Invalid slot");
    return;
  }

  setMode('C');
  Serial.println("ENROLL_START:SLOT:" + String(slot) + ":USER:" + userId);
  bool modelBuilt = false;
  const int maxEnrollAttempts = 4;
  bool gotFirstTemplate = false;
  bool gotSecondTemplate = false;

  for (int enrollAttempt = 1; enrollAttempt <= maxEnrollAttempts; enrollAttempt++) {
    gotFirstTemplate = captureTemplate(1, 15000, "Place Finger", "Slot " + String(slot), 3);
    if (!gotFirstTemplate) {
      if (enrollAttempt == maxEnrollAttempts) {
        Serial.println("ENROLL_FAIL:IMAGE2TZ_1");
        show("Enroll Failed", "First scan error");
        return;
      }
      show("Retry Enroll", "First scan weak", "Attempt " + String(enrollAttempt) + "/" + String(maxEnrollAttempts));
      waitFingerRemoved(2500);
      delay(250);
      continue;
    }

    show("Remove Finger");
    waitFingerRemoved(3500);
    delay(300);

    gotSecondTemplate = captureTemplate(2, 15000, "Place Again", "Slot " + String(slot), 3);
    if (!gotSecondTemplate) {
      if (enrollAttempt == maxEnrollAttempts) {
        Serial.println("ENROLL_FAIL:IMAGE2TZ_2");
        show("Enroll Failed", "Second scan error");
        return;
      }
      show("Retry Enroll", "Second scan weak", "Attempt " + String(enrollAttempt) + "/" + String(maxEnrollAttempts));
      waitFingerRemoved(2500);
      delay(250);
      continue;
    }

    int modelStatus = finger.createModel();
    if (modelStatus == FINGERPRINT_OK) {
      modelBuilt = true;
      break;
    }

    Serial.println("ENROLL_RETRY:CREATE_MODEL:" + String(enrollAttempt));
    show("Finger Mismatch", "Use same finger", "Retry " + String(enrollAttempt) + "/" + String(maxEnrollAttempts));
    waitFingerRemoved(3500);
    delay(250);
  }

  if (!modelBuilt) {
    Serial.println("ENROLL_FAIL:CREATE_MODEL");
    show("Enroll Failed", "Finger mismatch");
    return;
  }

  if (finger.storeModel(slot) != FINGERPRINT_OK) {
    Serial.println("ENROLL_FAIL:STORE_MODEL");
    show("Enroll Failed", "Store model fail");
    return;
  }

  saveSlotUser(slot, userId);
  show("Saved", userId, "Slot " + String(slot));
  Serial.println("ENROLL_OK:SLOT:" + String(slot) + ":USER:" + userId);
}

void doScan() {
  setMode('M');
  const int maxScanAttempts = 3;
  bool anyTemplateError = false;

  for (int scanAttempt = 1; scanAttempt <= maxScanAttempts; scanAttempt++) {
    show("Waiting Finger", "Monitor mode", "Try " + String(scanAttempt) + "/" + String(maxScanAttempts));

    if (!waitForImage(5000)) {
      continue;
    }

    int tz = finger.image2Tz();
    if (tz != FINGERPRINT_OK) {
      anyTemplateError = true;
      show("Adjust Finger", "Reading unclear", "Retrying...");
      waitFingerRemoved(2000);
      delay(150);
      continue;
    }

    int searchStatus = finger.fingerSearch();
    if (searchStatus == FINGERPRINT_OK) {
      int slot = finger.fingerID;
      int confidence = finger.confidence;
      String mappedUser = loadSlotUser(slot);
      String line3 = mappedUser.length() ? mappedUser : getUptime();

      if (confidence < MIN_MONITOR_CONFIDENCE) {
        show("NO ENTRY", "Low confidence", "Conf " + String(confidence));
        Serial.println("NO_MATCH:LOW_CONF:" + String(confidence));
        return;
      }

      show("MATCH", "Slot " + String(slot), line3);
      if (mappedUser.length()) {
        Serial.println("MATCH:SLOT:" + String(slot) + ":USER:" + mappedUser + ":CONF:" + String(confidence));
      } else {
        Serial.println("MATCH:SLOT:" + String(slot) + ":CONF:" + String(confidence));
      }
      return;
    }

    if (searchStatus == FINGERPRINT_NOTFOUND) {
      Serial.println("NO_MATCH");
      show("NO ENTRY", "No match");
      return;
    }

    show("Scan Retry", "Search unstable", "Retrying...");
    waitFingerRemoved(1500);
    delay(120);
  }

  if (anyTemplateError) {
    Serial.println("SCAN_FAIL:IMAGE2TZ");
    show("Scan Failed", "Template error");
  } else {
    Serial.println("SCAN_TIMEOUT");
    show("No Finger", "Timeout");
  }
}

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd == "PING") {
    Serial.println("READY");
    return;
  }

  if (cmd == "MODE:C") {
    setMode('C');
    return;
  }

  if (cmd == "MODE:M") {
    setMode('M');
    return;
  }

  if (cmd == "SCAN") {
    doScan();
    return;
  }

  if (cmd.startsWith("ENROLL:")) {
    int p1 = cmd.indexOf(':');
    int p2 = cmd.indexOf(':', p1 + 1);
    if (p1 < 0 || p2 < 0) {
      Serial.println("ENROLL_FAIL:BAD_FORMAT");
      return;
    }

    String slotStr = cmd.substring(p1 + 1, p2);
    String userId = cmd.substring(p2 + 1);
    slotStr.trim();
    userId.trim();

    int slot = slotStr.toInt();
    if (slot <= 0 || userId.length() == 0) {
      Serial.println("ENROLL_FAIL:INVALID_ARGS");
      return;
    }

    doEnroll(slot, userId);
    return;
  }

  Serial.println("UNKNOWN_CMD:" + cmd);
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(80);

  Wire.begin(21, 22);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  fpSerial.begin(57600, SERIAL_8N1, 16, 17);
  finger.begin(57600);
  preferences.begin("fp-map", false);

  startMillis = millis();

  if (finger.verifyPassword()) {
    show("Waiting Command", "Sensor OK");
    Serial.println("READY");
  } else {
    show("Sensor Error", "Check wiring");
    Serial.println("ERROR:SENSOR_NOT_FOUND");
  }
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    handleCommand(cmd);
  }
}
