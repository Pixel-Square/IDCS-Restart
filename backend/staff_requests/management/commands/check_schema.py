"""Quick script to check database schema"""
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Check RequestTemplate table schema'

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT column_name, is_nullable, data_type, column_default
                FROM information_schema.columns
                WHERE table_name='staff_requests_requesttemplate'
                ORDER BY ordinal_position
            """)
            
            self.stdout.write('\nRequestTemplate table schema:')
            self.stdout.write('-' * 80)
            for row in cursor.fetchall():
                self.stdout.write(f'{row[0]:25} | {row[1]:10} | {row[2]:15} | {row[3]}')
