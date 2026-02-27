from __future__ import annotations

from django import forms
from django.contrib.auth.forms import AuthenticationForm


class PowerBIAuthenticationForm(AuthenticationForm):
    username = forms.CharField(
        label='Register No / Staff ID',
        widget=forms.TextInput(attrs={'autofocus': True, 'autocomplete': 'username'}),
    )

    error_messages = {
        'invalid_login': 'Invalid ID or password.',
        'inactive': 'This account is inactive.',
    }
