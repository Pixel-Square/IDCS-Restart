import requests
print("without slash:", requests.get('http://127.0.0.1/api/obe/ssa1-published/20CE0803').status_code)
