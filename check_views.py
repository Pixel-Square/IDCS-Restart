import re

filepath = r"backend\curriculum\views.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()
print("Views.py last 200 chars:")
print(repr(content[-200:]))
print("Total length:", len(content))
