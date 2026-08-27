import os
import sys
import django
import json
import datetime
from decimal import Decimal

# Set up Django environment
sys.path.append('.')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'erp.settings')
django.setup()

from django.apps import apps
from django.core.serializers.json import DjangoJSONEncoder

# Custom JSON Encoder that handles Datetime, Decimal, UUID, and falls back to string
class OBEDataEncoder(DjangoJSONEncoder):
    def default(self, o):
        if isinstance(o, (datetime.datetime, datetime.date, datetime.time)):
            return o.isoformat()
        elif isinstance(o, Decimal):
            return float(o)
        try:
            return super().default(o)
        except TypeError:
            return str(o)

def dump_obe_data():
    obe_app = apps.get_app_config('OBE')
    models = sorted(list(obe_app.get_models()), key=lambda m: m._meta.db_table)
    output_path = "/home/iqac/IDCS-Restart/obe_data.json"
    
    print(f"Starting OBE data dump to {output_path}...")
    print(f"Total tables to process: {len(models)}")
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("{\n")
        for i, model in enumerate(models):
            table_name = model._meta.db_table
            print(f"Processing table: {table_name} ...", end="", flush=True)
            
            # Write key
            f.write(f"  {json.dumps(table_name)}: [\n")
            
            # Fetch all records
            records = list(model.objects.values())
            record_count = len(records)
            print(f" {record_count} records found.")
            
            for j, record in enumerate(records):
                # Write each record
                record_str = json.dumps(record, cls=OBEDataEncoder)
                f.write(f"    {record_str}")
                if j < record_count - 1:
                    f.write(",\n")
                else:
                    f.write("\n")
            
            # Close array
            f.write("  ]")
            if i < len(models) - 1:
                f.write(",\n")
            else:
                f.write("\n")
                
        f.write("}\n")
        
    print(f"Finished! JSON file successfully created at {output_path}")

if __name__ == "__main__":
    dump_obe_data()
