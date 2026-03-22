from django.contrib import admin

from .models import (
    SalaryDeductionType,
    SalaryEMIPlan,
    SalaryEarnType,
    SalaryFormulaConfig,
    SalaryMonthlyInput,
    SalaryPFConfig,
    StaffSalaryDeclaration,
)


admin.site.register(StaffSalaryDeclaration)
admin.site.register(SalaryPFConfig)
admin.site.register(SalaryFormulaConfig)
admin.site.register(SalaryDeductionType)
admin.site.register(SalaryEarnType)
admin.site.register(SalaryEMIPlan)
admin.site.register(SalaryMonthlyInput)
