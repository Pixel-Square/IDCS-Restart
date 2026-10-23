from django.core.management.base import BaseCommand

from hostel.models import RoomAllocation, Room
from hostel.services import recalculate_room_occupancy


class Command(BaseCommand):
    help = (
        'Recalculate cached room occupancy/status from active hostel allocations. '
        'Run this after data imports or manual database changes.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--room',
            type=int,
            help='Only recalculate the room with this id.',
        )

    def handle(self, *args, **options):
        if options.get('room'):
            rooms = Room.objects.filter(pk=options['room'])
        else:
            rooms = Room.objects.all()

        total = 0
        for room in rooms:
            recalculate_room_occupancy(room)
            total += 1

        active = RoomAllocation.objects.filter(status=RoomAllocation.STATUS_ACTIVE).count()
        self.stdout.write(
            self.style.SUCCESS(
                f'Recalculated {total} room(s). Active allocations in database: {active}.'
            )
        )
