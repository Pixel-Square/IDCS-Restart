import re

with open("src/pages/COE/BarScan.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Replace handleScan logic to have an explicit process function
old_scan_func = """  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedCode.trim()) return;

    setLoading(true);
    setError(null);
    setStudent(null);
    const code = scannedCode.trim();
    // Open the mark entry page dynamically over the page
    setActiveEntryCode(code);"""

new_scan_func = """  const processScanCode = async (codeToProcess: string) => {
    if (!codeToProcess) return;
    
    setScannedCode(''); // Clear input for next scan immediately here as well
    setLoading(true);
    setError(null);
    setStudent(null);
    const code = codeToProcess.trim();
    
    // Open the mark entry page dynamically over the page
    setActiveEntryCode(code);

"""

text = text.replace(old_scan_func, new_scan_func)

# And now we add the handleScan back connecting to processScanCode
text = text.replace("const code = codeToProcess.trim();", "const code = codeToProcess.trim();\n")

# Wait, handleScan needs to be reconstructed
text = re.sub(r'const processScanCode = async \(codeToProcess: string\) => \{',
        """  const processScanCode = async (codeToProcess: string) => {
""", text)

text = text.replace("""        } else {
          setError('Error fetching student details.');
        }
      }
    } catch (err) {
      setError('Network error occurred.');
    } finally {
      setLoading(false);
      setScannedCode(''); // Clear input for next scan
    }
  };""", """        } else {
          setError('Error fetching student details.');
        }
      }
    } catch (err) {
      setError('Network error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    await processScanCode(scannedCode);
  };""")

text = text.replace("""          onNextScan={(newCode) => {
             setScannedCode(newCode);
             setTimeout(() => {
                const form = document.getElementById('barscan-form');
                if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
             }, 0);
          }}""", """          onNextScan={(newCode) => {
             processScanCode(newCode);
          }}""")

with open("src/pages/COE/BarScan.tsx", "w", encoding="utf-8") as f:
    f.write(text)
