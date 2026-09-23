import requests
from django.conf import settings
from django.shortcuts import redirect
from django.http import JsonResponse
from .models import GithubProfile
from .utils import encrypt_token
from django.core.cache import cache
from .tasks import generate_wrapped_task

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


def github_login(request):
    """Step 1: User ko GitHub ke consent page pe bhejo"""
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "read:user public_repo",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return redirect(f"{GITHUB_AUTHORIZE_URL}?{query}")


def github_callback(request):
    """Step 2: GitHub se code milega, usse access_token lo, phir user info lo"""
    code = request.GET.get("code")
    if not code:
        return JsonResponse({"error": "No code provided"}, status=400)

    # Code ko token se exchange karo
    token_response = requests.post(
        GITHUB_TOKEN_URL,
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
            "redirect_uri": settings.GITHUB_REDIRECT_URI,
        },
    )
    token_data = token_response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        return JsonResponse({"error": "Failed to get access token", "details": token_data}, status=400)

    # Access token se user info nikalo
    user_response = requests.get(
        GITHUB_USER_URL,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    user_data = user_response.json()

    # DB mein save karo (encrypted token ke saath)
    profile, _ = GithubProfile.objects.update_or_create(
        github_id=str(user_data["id"]),
        defaults={
            "github_username": user_data["login"],
            "encrypted_token": encrypt_token(access_token),
        },
    )

    # Abhi ke liye simple JSON response — baad mein frontend pe redirect karenge
    return JsonResponse({
        "message": "Login successful",
        "username": profile.github_username,
    })

def trigger_wrapped(request, username):
    """User ne 'Generate' dabaya — cache check karo, warna Celery task chalao."""
    cached = cache.get(f"wrapped:{username}")
    if cached:
        return JsonResponse({"status": "done", "data": cached})

    try:
        profile = GithubProfile.objects.get(github_username=username)
    except GithubProfile.DoesNotExist:
        return JsonResponse({"error": "User not authenticated first"}, status=404)

    task = generate_wrapped_task.delay(profile.id)
    return JsonResponse({"status": "processing", "task_id": task.id})


def check_wrapped_status(request, task_id):
    """Frontend yahan poll karega task ready hai ya nahi."""
    from celery.result import AsyncResult
    result = AsyncResult(task_id)

    if result.ready():
        return JsonResponse({"status": "done", "data": result.result})
    return JsonResponse({"status": "processing"})