# Minimal stub parser - replace with openpyxl/pandas implementation.
def parse_cdap_excel(file_obj):
    # file_obj is Django UploadedFile; you can read bytes: file_obj.read()
    return {
        "rows": [],
        "books": {"textbook": "", "reference": ""},
        "activeLearningOptions": [],
        "iqacRows": [],
    }
