from django.core.management.base import BaseCommand
from django.db import transaction

from hostel.models import Bed, Building, Floor, Room


class Command(BaseCommand):
    help = (
        'Create demo Boys and Girls hostel buildings with floors and rooms. '
        'Idempotent: existing buildings/floors/rooms (matched by code/number) are reused.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--rooms-per-floor',
            type=int,
            default=6,
            help='Number of rooms to create on each floor (default: 6).',
        )
        parser.add_argument(
            '--floors',
            type=int,
            default=2,
            help='Number of floors per hostel (default: 2).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        rooms_per_floor = max(int(options.get('rooms_per_floor') or 6), 1)
        floor_count = max(int(options.get('floors') or 2), 1)

        specs = [
            ('BH-1', 'Boys Hostel Block A', 'BOYS', 100, 'BOYS'),
            ('GH-1', 'Girls Hostel Block A', 'GIRLS', 200, 'GIRLS'),
        ]

        created_buildings = 0
        created_floors = 0
        created_rooms = 0
        created_beds = 0

        for code, name, category, number_base, room_category in specs:
            building, created = Building.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'building_type': Building.TYPE_HOSTEL,
                    'hostel_category': category,
                    'planned_floors': floor_count,
                    'status': Building.STATUS_ACTIVE,
                },
            )
            if created:
                created_buildings += 1
            else:
                # Keep the category and type in sync when the command is re-run.
                changed = False
                if building.building_type != Building.TYPE_HOSTEL:
                    building.building_type = Building.TYPE_HOSTEL
                    changed = True
                if building.hostel_category != category:
                    building.hostel_category = category
                    changed = True
                if building.planned_floors < floor_count:
                    building.planned_floors = floor_count
                    changed = True
                if changed:
                    building.save()

            for floor_number in range(1, floor_count + 1):
                floor, floor_created = Floor.objects.get_or_create(
                    building=building,
                    floor_number=floor_number,
                    defaults={
                        'name': f'Floor {floor_number}',
                        'status': Floor.STATUS_ACTIVE,
                        'is_available_for_allocation': True,
                    },
                )
                if floor_created:
                    created_floors += 1

                for index in range(1, rooms_per_floor + 1):
                    room_number = str(number_base + (floor_number - 1) * 100 + index)
                    room, room_created = Room.objects.get_or_create(
                        building=building,
                        room_number=room_number,
                        defaults={
                            'floor': floor,
                            'room_type': Room.TYPE_DOUBLE,
                            'room_purpose': Room.PURPOSE_HOSTEL,
                            'capacity': 2,
                            'bed_count': 2,
                            'hostel_category': room_category,
                            'facilities': ['Fan', 'Cot', 'Study table', 'Wi-Fi'],
                            'status': Room.STATUS_AVAILABLE,
                        },
                    )
                    if room_created:
                        created_rooms += 1

                    # Beds are the unit used by the allocation screen. Keep
                    # them in sync with the room capacity on every run.
                    bed_total = int(room.bed_count or room.capacity or 0)
                    for bed_index in range(1, bed_total + 1):
                        _, bed_created = Bed.objects.get_or_create(
                            room=room,
                            bed_number=str(bed_index),
                        )
                        if bed_created:
                            created_beds += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Hostel demo data ready: {created_buildings} building(s), '
                f'{created_floors} floor(s), {created_rooms} room(s), '
                f'{created_beds} bed(s) created.'
            )
        )
