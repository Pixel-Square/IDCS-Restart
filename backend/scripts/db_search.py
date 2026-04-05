from django.db import connection
from django.apps import apps

def run():
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        tables = [r[0] for r in cursor.fetchall()]
        print("--- Tables containing 'ext' or 'staff' ---")
        for t in tables:
            if 'ext' in t.lower() or 'staff' in t.lower():
                print(f"Table: {t}")
                cursor.execute(f"SELECT COUNT(*) FROM \"{t}\"")
                print(f"  Count: {cursor.fetchone()[0]}")
        
        print("\n--- Searching for External Emails in accounts_user ---")
        cursor.execute("SELECT id, username, email FROM accounts_user WHERE email NOT LIKE '%@krct.ac.in%' AND email NOT LIKE '%@krgi.ac.in%' AND email != ''")
        external_users = cursor.fetchall()
        print(f"Found {len(external_users)} potential external users.")
        for user in external_users[:20]:
            print(user)
        
        print("\n--- DB Connection Info ---")
        from django.db import connections
        db_config = connections['default'].settings_dict
        print(f"Host: {db_config.get('HOST')}")
        print(f"Database: {db_config.get('NAME')}")
        print(f"User: {db_config.get('USER')}")

if __name__ == "__main__":
    run()
