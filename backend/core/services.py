import requests
from datetime import datetime
from collections import Counter
from .models import GithubProfile
from .utils import decrypt_token

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"

CONTRIBUTIONS_QUERY = """
query($username: String!) {
  user(login: $username) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalRepositoryContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            weekday
            contributionCount
          }
        }
      }
    }
    repositories(first: 15, isFork: false, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        primaryLanguage { name }
        stargazerCount
      }
    }
    followers { totalCount }
  }
}
"""

def fetch_github_wrapped_data(profile: GithubProfile) -> dict:
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
    contributions = raw["contributionsCollection"]
    calendar = contributions["contributionCalendar"]

    all_days = [
        day
        for week in calendar["weeks"]
        for day in week["contributionDays"]
    ]

    # Longest streak
    longest_streak = current_streak = 0
    for day in all_days:
        if day["contributionCount"] > 0:
            current_streak += 1
            longest_streak = max(longest_streak, current_streak)
        else:
            current_streak = 0

    # Weekday pattern — 0=Sunday, 6=Saturday (GitHub ka format)
    weekday_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    weekday_totals = Counter()
    for day in all_days:
        weekday_totals[day["weekday"]] += day["contributionCount"]

    most_active_day = weekday_names[max(weekday_totals, key=weekday_totals.get)] if weekday_totals else "N/A"
    weekend_commits = weekday_totals[0] + weekday_totals[6]  # Sunday + Saturday
    weekday_commits = calendar["totalContributions"] - weekend_commits
    is_weekend_warrior = weekend_commits > weekday_commits

    # Language frequency
    languages = Counter()
    starred_repos = []
    for repo in raw["repositories"]["nodes"]:
        lang = repo["primaryLanguage"]["name"] if repo["primaryLanguage"] else None
        if lang:
            languages[lang] += 1
        starred_repos.append((repo["name"], repo["stargazerCount"]))

    top_language = languages.most_common(1)[0][0] if languages else "N/A"
    most_starred = max(starred_repos, key=lambda x: x[1]) if starred_repos else ("N/A", 0)

    return {
        "total_contributions": calendar["totalContributions"],
        "longest_streak": longest_streak,
        "top_language": top_language,
        "top_repos": [r["name"] for r in raw["repositories"]["nodes"][:5]],

        # Naye stats
        "total_prs": contributions["totalPullRequestContributions"],
        "total_issues": contributions["totalIssueContributions"],
        "total_repos_created": contributions["totalRepositoryContributions"],
        "most_active_day": most_active_day,
        "is_weekend_warrior": is_weekend_warrior,
        "most_starred_repo": most_starred[0],
        "most_starred_repo_stars": most_starred[1],
        "followers_count": raw["followers"]["totalCount"],

        "generated_at": datetime.utcnow().isoformat(),
    }