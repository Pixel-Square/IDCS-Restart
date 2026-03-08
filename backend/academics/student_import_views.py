from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Q
from accounts.utils import get_user_permissions
from accounts.models import User
from academics.models import Department, StudentProfile, STUDENT_STATUS_CHOICES
import csv
import io

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.worksheet.datavalidation import DataValidation
    EXCEL_SUPPORT = True
except ImportError:
    EXCEL_SUPPORT = False


class StudentImportTemplateDownloadView(APIView):
    """Download an Excel template for importing students with dropdown validations."""
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        perms = get_user_permissions(user)
        
        # Check permission
        if not ('academics.add_studentprofile' in perms or user.is_staff or user.is_superuser):
            return Response({'error': 'You do not have permission to download student import template'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        if not EXCEL_SUPPORT:
            return Response({'error': 'Excel support not available. Please install openpyxl.'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Get all departments
            departments = Department.objects.all().order_by('short_name')
            dept_names = [dept.short_name or dept.code for dept in departments if dept.short_name or dept.code]
            
            # Get status choices
            status_values = [choice[0] for choice in STUDENT_STATUS_CHOICES]
            
            # Create Excel workbook
            wb = Workbook()
            ws = wb.active
            ws.title = "Student Import"
            
            # Headers
            headers = ['Registration Number', 'Student Name', 'Department', 'Email', 'Status']
            ws.append(headers)
            
            # Sample row
            sample_dept = dept_names[0] if dept_names else 'CSE'
            ws.append(['2023001', 'John Doe', sample_dept, 'john.doe@student.example.com', 'ACTIVE'])
            
            # Add data validation (dropdown) for department column (column C)
            if dept_names:
                dept_list = ','.join(dept_names)
                dv_dept = DataValidation(type="list", formula1=f'"{dept_list}"', allow_blank=False)
                dv_dept.error = 'Please select a department from the dropdown'
                dv_dept.errorTitle = 'Invalid Department'
                dv_dept.prompt = 'Select a department'
                dv_dept.promptTitle = 'Department'
                
                ws.add_data_validation(dv_dept)
                dv_dept.add('C2:C1000')
            
            # Add data validation (dropdown) for status column (column E)
            if status_values:
                status_list = ','.join(status_values)
                dv_status = DataValidation(type="list", formula1=f'"{status_list}"', allow_blank=False)
                dv_status.error = 'Please select a status from the dropdown'
                dv_status.errorTitle = 'Invalid Status'
                dv_status.prompt = 'Select student status'
                dv_status.promptTitle = 'Status'
                
                ws.add_data_validation(dv_status)
                dv_status.add('E2:E1000')
            
            # Adjust column widths
            ws.column_dimensions['A'].width = 25  # Registration Number
            ws.column_dimensions['B'].width = 30  # Student Name
            ws.column_dimensions['C'].width = 20  # Department
            ws.column_dimensions['D'].width = 35  # Email
            ws.column_dimensions['E'].width = 12  # Status
            
            # Save to bytes
            from io import BytesIO
            excel_file = BytesIO()
            wb.save(excel_file)
            excel_file.seek(0)
            
            response = HttpResponse(
                excel_file.read(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = 'attachment; filename="student_import_template.xlsx"'
            return response
            
        except Exception as e:
            return Response({'error': f'Failed to generate template: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StudentBulkImportView(APIView):
    """Bulk import students from CSV or Excel file."""
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        user = request.user
        perms = get_user_permissions(user)
        
        # Check permission
        if not ('academics.add_studentprofile' in perms or user.is_staff or user.is_superuser):
            return Response({'error': 'You do not have permission to import students'}, 
                          status=status.HTTP_403_FORBIDDEN)
        
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        filename = uploaded_file.name.lower()
        is_excel = filename.endswith(('.xlsx', '.xls'))
        is_csv = filename.endswith('.csv')
        
        if not (is_csv or is_excel):
            return Response({'error': 'File must be CSV or Excel (.xlsx, .xls, .csv)'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Parse file based on format
        rows = []
        if is_excel:
            if not EXCEL_SUPPORT:
                return Response({'error': 'Excel support not available. Please install openpyxl or use CSV format.'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            try:
                wb = load_workbook(uploaded_file, read_only=True)
                ws = wb.active
                
                # Get headers from first row
                headers = []
                for cell in ws[1]:
                    headers.append(str(cell.value).strip().lower() if cell.value else '')
                
                # Read data rows
                for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
                    row_dict = {}
                    for idx, value in enumerate(row):
                        if idx < len(headers) and headers[idx]:
                            row_dict[headers[idx]] = str(value).strip() if value is not None else ''
                    if any(row_dict.values()):  # Skip empty rows
                        rows.append((row_idx, row_dict))
            except Exception as e:
                return Response({'error': f'Failed to parse Excel file: {str(e)}'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        else:
            # Parse CSV
            try:
                decoded_file = uploaded_file.read().decode('utf-8-sig')
                io_string = io.StringIO(decoded_file)
                reader = csv.DictReader(io_string)
                # Normalize header names to lowercase
                normalized_rows = []
                for idx, row in enumerate(reader, start=2):
                    normalized_row = {k.strip().lower(): v.strip() if v else '' for k, v in row.items()}
                    normalized_rows.append((idx, normalized_row))
                rows = normalized_rows
            except Exception as e:
                return Response({'error': f'Failed to parse CSV file: {str(e)}'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        # Process rows
        created_count = 0
        updated_count = 0
        errors = []
        
        try:
            with transaction.atomic():
                for idx, row in rows:
                    try:
                        # Extract fields (handle different header variations)
                        reg_no = row.get('registration number', row.get('reg_no', row.get('regno', ''))).strip()
                        student_name = row.get('student name', row.get('name', '')).strip()
                        dept_name = row.get('department', row.get('dept', '')).strip()
                        email = row.get('email', '').strip()
                        status_value = row.get('status', 'ACTIVE').strip().upper()
                        
                        # Validate required fields
                        if not reg_no:
                            errors.append(f'Row {idx}: Registration Number is required')
                            continue
                        
                        if not student_name:
                            errors.append(f'Row {idx}: Student Name is required')
                            continue
                        
                        if not dept_name:
                            errors.append(f'Row {idx}: Department is required')
                            continue
                        
                        # Find department
                        try:
                            department = Department.objects.get(Q(short_name__iexact=dept_name) | Q(code__iexact=dept_name))
                        except Department.DoesNotExist:
                            errors.append(f'Row {idx}: Department "{dept_name}" not found')
                            continue
                        except Department.MultipleObjectsReturned:
                            # Prefer short_name match
                            department = Department.objects.filter(short_name__iexact=dept_name).first()
                            if not department:
                                department = Department.objects.filter(code__iexact=dept_name).first()
                        
                        # Validate status
                        valid_statuses = [choice[0] for choice in STUDENT_STATUS_CHOICES]
                        if status_value not in valid_statuses:
                            errors.append(f'Row {idx}: Invalid status "{status_value}". Must be one of: {", ".join(valid_statuses)}')
                            continue
                        
                        # Split name into first and last name
                        name_parts = student_name.split(maxsplit=1)
                        first_name = name_parts[0] if name_parts else ''
                        last_name = name_parts[1] if len(name_parts) > 1 else ''
                        
                        # Try to find existing user by email or username (reg_no)
                        existing_user = None
                        if email:
                            existing_user = User.objects.filter(email=email).first()
                        if not existing_user:
                            existing_user = User.objects.filter(username=reg_no).first()
                        
                        if existing_user:
                            # Update existing user
                            user_obj = existing_user
                            user_obj.first_name = first_name
                            user_obj.last_name = last_name
                            if email:
                                user_obj.email = email
                            user_obj.save()
                        else:
                            # Create new user
                            user_obj = User.objects.create(
                                username=reg_no,
                                first_name=first_name,
                                last_name=last_name,
                                email=email if email else '',
                            )
                            # Set a default password (should be changed by user)
                            user_obj.set_password('changeme123')
                            user_obj.save()
                        
                        # Create or update student profile
                        try:
                            student_profile = StudentProfile.objects.get(reg_no=reg_no)
                            # Update existing profile
                            student_profile.user = user_obj
                            student_profile.status = status_value
                            student_profile.save()
                            updated_count += 1
                        except StudentProfile.DoesNotExist:
                            # Create new profile
                            student_profile = StudentProfile.objects.create(
                                user=user_obj,
                                reg_no=reg_no,
                                status=status_value,
                            )
                            created_count += 1
                        
                    except Exception as e:
                        errors.append(f'Row {idx}: {str(e)}')
                        continue
            
            return Response({
                'message': f'Import completed. Created: {created_count}, Updated: {updated_count}',
                'created': created_count,
                'updated': updated_count,
                'errors': errors
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({'error': f'Import failed: {str(e)}'}, 
                          status=status.HTTP_500_INTERNAL_SERVER_ERROR)
