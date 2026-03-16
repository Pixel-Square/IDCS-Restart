"""
Example demonstration of Full day leave feature behavior
"""

# Example 1: Staff applies CL for 1.5 days
# from_date: 2024-03-10, from_noon: "Full day"
# to_date: 2024-03-11, to_noon: "FN"

example_1_form_data = {
    'from_date': '2024-03-10',
    'to_date': '2024-03-11', 
    'from_noon': 'Full day',
    'to_noon': 'FN',
    'reason': 'Personal work'
}

print("="*80)
print("EXAMPLE 1: 2 days Leave (Full day → FN)")
print("="*80)
print(f"Form Data: {example_1_form_data}")
print("\n--- Day Calculation (Calendar Days) ---")
print("From: 2024-03-10, To: 2024-03-11")
print("Calendar Days: 2 days")
print("\n--- Attendance Records Created ---")
print("2024-03-10:")
print("  FN: CL (Leave)")
print("  AN: CL (Leave)")
print("  Status: CL")
print("\n2024-03-11:")
print("  FN: CL (Leave)")
print("  AN: <preserved from PS upload, or 'no record' if not uploaded>")
print("  Status: half_day (if AN present/absent), or CL (if no AN record)")
print("\n--- Leave Balance Impact ---")
print("Initial Balance: 6 days")
print("Deducted: 2 days (calendar days)")
print("New Balance: 4 days")

# Example 2: Staff applies CL for 2 days
# from_date: 2024-03-12, from_noon: "Full day"
# to_date: 2024-03-13, to_noon: "Full day"

example_2_form_data = {
    'from_date': '2024-03-12',
    'to_date': '2024-03-13',
    'from_noon': 'Full day',
    'to_noon': 'Full day',
    'reason': 'Medical'
}

print("\n" + "="*80)
print("EXAMPLE 2: 2 days Leave (Full day → Full day)")
print("="*80)
print(f"Form Data: {example_2_form_data}")
print("\n--- Day Calculation (Calendar Days) ---")
print("From: 2024-03-12, To: 2024-03-13")
print("Calendar Days: 2 days")
print("\n--- Attendance Records Created ---")
print("2024-03-12:")
print("  FN: CL (Leave)")
print("  AN: CL (Leave)")
print("  Status: CL")
print("\n2024-03-13:")
print("  FN: CL (Leave)")
print("  AN: CL (Leave)")
print("  Status: CL")
print("\n--- Leave Balance Impact ---")
print("Initial Balance: 4 days (from previous example)")
print("Deducted: 2 days (calendar days)")
print("New Balance: 2 days")

# Example 3: Staff applies CL for 0.5 days (half day)
# from_date: 2024-03-14, from_noon: "FN"

example_3_form_data = {
    'from_date': '2024-03-14',
    'from_noon': 'FN',
    'reason': 'Doctor appointment'
}

print("\n" + "="*80)
print("EXAMPLE 3: 1 day Leave (FN only)")
print("="*80)
print(f"Form Data: {example_3_form_data}")
print("\n--- Day Calculation (Calendar Days) ---")
print("From: 2024-03-14 (single day)")
print("Calendar Days: 1 day")
print("\n--- Attendance Records Created ---")
print("2024-03-14:")
print("  FN: CL (Leave)")
print("  AN: <preserved from PS upload, or 'no record' if not uploaded>")
print("  Status: half_day (if AN present/absent), or CL (if no AN record)")
print("\n--- Leave Balance Impact ---")
print("Initial Balance: 2 days (from previous example)")
print("Deducted: 1 day (calendar days)")
print("New Balance: 1 day")

# Example 4: Staff applies CL for 3 days with insufficient balance (overflow to LOP)
# from_date: 2024-03-15, from_noon: "Full day"
# to_date: 2024-03-17, to_noon: "Full day"

example_4_form_data = {
    'from_date': '2024-03-15',
    'to_date': '2024-03-17',
    'from_noon': 'Full day',
    'to_noon': 'Full day',
    'reason': 'Family function'
}

print("\n" + "="*80)
print("EXAMPLE 4: 3 days Leave with Insufficient Balance (LOP overflow)")
print("="*80)
print(f"Form Data: {example_4_form_data}")
print("\n--- Day Calculation (Calendar Days) ---")
print("From: 2024-03-15, To: 2024-03-17")
print("Calendar Days: 3 days")
print("\n--- Leave Balance Impact ---")
print("Initial CL Balance: 1 day (from previous example)")
print("Requested: 3 days")
print("Deducted from CL: 1 day → CL Balance becomes 0")
print("Overflow: 3 - 1 = 2 days")
print("LOP increases by: 2 days")
print("\nFinal Balances:")
print("  CL: 0 days")
print("  LOP: 2 days (assuming started at 0)")

# Example 5: Complex range (FN to AN over 3 days)
# from_date: 2024-03-18, from_noon: "FN"
# to_date: 2024-03-20, to_noon: "AN"

example_5_form_data = {
    'from_date': '2024-03-18',
    'to_date': '2024-03-20',
    'from_noon': 'FN',
    'to_noon': 'AN',
    'reason': 'Conference'
}

print("\n" + "="*80)
print("EXAMPLE 5: FN to AN over 3 days")
print("="*80)
print(f"Form Data: {example_5_form_data}")
print("\n--- Day Calculation (Calendar Days) ---")
print("From: 2024-03-18, To: 2024-03-20")
print("Calendar Days: 3 days")
print("\n--- Attendance Records Created ---")
print("2024-03-18:")
print("  FN: CL (Leave)")
print("  AN: <preserved from PS upload>")
print("\n2024-03-19:")
print("  FN: CL (Leave)")
print("  AN: CL (Leave)")
print("\n2024-03-20:")
print("  FN: <preserved from PS upload>")
print("  AN: CL (Leave)")
print("\n--- Leave Balance Impact ---")
print("Deducted: 3 days (calendar days)")

print("\n" + "="*80)
print("KEY POINTS:")
print("="*80)
print("1. Leave balance deducts by CALENDAR DAYS (not fractional)")
print("2. Attendance marking respects shift selection (FN/AN/Full day)")
print("3. '2 days' in balance = from_date to to_date spanning 2 calendar days")
print("4. Example: Full day → FN = 2 calendar days deducted, Day 2 AN preserved/shown")
print("5. LOP increases based on calendar days, not forms")
print("="*80)