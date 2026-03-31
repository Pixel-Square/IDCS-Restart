import re

with open("src/pages/COE/BarScan.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add import for BarScanMarkEntry
if "import BarScanMarkEntry from './BarScanMarkEntry';" not in text:
    text = text.replace("import fetchWithAuth from '../../services/fetchAuth';", "import fetchWithAuth from '../../services/fetchAuth';\nimport BarScanMarkEntry from './BarScanMarkEntry';")

# Add state for active entry
state_replace = """  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [activeEntryCode, setActiveEntryCode] = useState<string | null>(null);"""
text = text.replace("  const [lastScanned, setLastScanned] = useState<string | null>(null);", state_replace)

# Modify handleScan
old_scan = """    const targetUrl = new URL(`/coe/bar-scan/entry?code=${encodeURIComponent(code)}`, window.location.origin).toString();

    // Open the mark entry page immediately so each scan gets its own tab.
    const popup = window.open(targetUrl, '_blank');
    if (!popup) {
      setError('Popup blocked. Please allow popups for this site.');
      setLoading(false);
      return;
    }"""

new_scan = """    // Open the mark entry page dynamically over the page
    setActiveEntryCode(code);"""

text = text.replace(old_scan, new_scan)

# Modify return statement
outer_end = """        </div>
      </div>
    </div>
  );
}"""

new_outer_end = """        </div>
      </div>
      {activeEntryCode && (
        <BarScanMarkEntry
          key={activeEntryCode}
          embeddedCode={activeEntryCode}
          onClose={() => setActiveEntryCode(null)}
          onNextScan={(newCode) => {
             setScannedCode(newCode);
             setTimeout(() => {
                const form = document.getElementById('barscan-form');
                if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
             }, 0);
          }}
        />
      )}
    </div>
  );
}"""

text = text.replace(outer_end, new_outer_end)
text = text.replace('<form onSubmit={handleScan} className="w-full">', '<form id="barscan-form" onSubmit={handleScan} className="w-full">')

with open("src/pages/COE/BarScan.tsx", "w", encoding="utf-8") as f:
    f.write(text)

