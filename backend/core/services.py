import requests
from datetime import datetime
from .models import GithubProfile
from .utils import decrypt_token

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

CONTRIBUTIONS_QUERY = """
query($username: String!) {
  user(login: $username) {
    contributionsCollection {
      totalCommitContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
    repositories(first: 10, isFork: false, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        primaryLanguage { name }
        stargazerCount
      }
    }
  }
}
"""

def fetch_github_wrapped_data(profile: GithubProfile) -> dict:
    """
    GitHub GraphQL se ek hi call mein stats nikalta hai.
    Rate-limit friendly: sirf 1 request, 5000/hour limit ka bohot chhota fraction.
    """
    token = decrypt_token(profile.encrypted_token)

    response = requests.post(
        GITHUB_GRAPHQL_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={
            "query": CONTRIBUTIONS_QUERY,
            "variables": {"username": profile.github_username},
        },
        timeout=10,
    )
    response.raise_for_status()
    raw = response.json()["data"]["user"]

    return _process_raw_data(raw)


def _process_raw_data(raw: dict) -> dict:
    """Raw GitHub response ko clean, frontend-ready stats mein convert karta hai."""
    calendar = raw["contributionsCollection"]["contributionCalendar"]
    all_days = [
        day
        for week in calendar["weeks"]
        for day in week["contributionDays"]
    ]

    # Longest streak calculate karo
    longest_streak = current_streak = 0
    for day in all_days:
        if day["contributionCount"] > 0:
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)
        else:
            current_streak = 0

    # Language frequency
    languages = {}
    for repo in raw["repositories"]["nodes"]:
        lang = repo["primaryLanguage"]["name"] if repo["primaryLanguage"] else None
        if lang:
            languages[lang] = languages.get(lang, 0) + 1
    top_language = max(languages, key=languages.get) if languages else "N/A"

    return {
        "total_contributions": calendar["totalContributions"],
        "longest_streak": longest_streak,
        "top_language": top_language,
        "top_repos": [r["name"] for r in raw["repositories"]["nodes"][:5]],
        "generated_at": datetime.utcnow().isoformat(),
    }