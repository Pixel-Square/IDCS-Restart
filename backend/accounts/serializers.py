from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Role, RoleMap

User = get_user_model()


class RoleMapSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoleMap
        fields = ('key', 'value')


class RoleSerializer(serializers.ModelSerializer):
    maps = RoleMapSerializer(many=True, read_only=True)

    class Meta:
        model = Role
        fields = ('id', 'name', 'maps')


class UserSerializer(serializers.ModelSerializer):
    role = RoleSerializer(read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role')


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email'),
            password=validated_data['password'],
        )
        return user
