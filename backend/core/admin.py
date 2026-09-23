from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import GithubProfile, WrappedResult

admin.site.register(GithubProfile)
admin.site.register(WrappedResult)