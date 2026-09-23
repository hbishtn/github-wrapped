from django.urls import path
from . import views

urlpatterns = [
    path("login/", views.github_login, name="github_login"),
    path("callback/", views.github_callback, name="github_callback"),
    path("wrapped/<str:username>/", views.trigger_wrapped, name="trigger_wrapped"),
    path("wrapped/status/<str:task_id>/", views.check_wrapped_status, name="check_wrapped_status"),
]