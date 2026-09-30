from celery import shared_task
from django.core.cache import cache
from .models import GithubProfile, WrappedResult
from .services import fetch_github_wrapped_data

CACHE_TTL = 60 * 60 * 6  # 6 ghante

@shared_task
def generate_wrapped_task(profile_id: int, range_key: str = "year") -> dict:
    """Background mein GitHub stats fetch karke DB + cache mein save karta hai."""
    profile = GithubProfile.objects.get(id=profile_id)

    data = fetch_github_wrapped_data(profile, range_key)

    WrappedResult.objects.create(profile=profile, data=data)
    cache.set(f"wrapped:{profile.github_username}:{range_key}", data, CACHE_TTL)

    return data
