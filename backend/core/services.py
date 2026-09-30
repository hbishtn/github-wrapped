import requests
from datetime import datetime, timedelta, timezone
from collections import Counter
from .models import GithubProfile
from .utils import decrypt_token

GITHUB_GRAPHQL_URL = "https://api.github.com/graphql"
RANGE_DAYS = {"week": 7, "month": 30, "year": 365}

CONTRIBUTIONS_QUERY = """
query($username: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $username) {
    contributionsCollection(from: $from, to: $to) {
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
            contributionLevel
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

def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _query(token, username, win_from, win_to):
    response = requests.post(
        GITHUB_GRAPHQL_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={
            "query": CONTRIBUTIONS_QUERY,
            "variables": {"username": username, "from": _iso(win_from), "to": _iso(win_to)},
        },
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    if "errors" in payload:
        raise ValueError(payload["errors"][0]["message"])
    return payload["data"]["user"]


def _created_at_year(token, username):
    response = requests.post(
        GITHUB_GRAPHQL_URL,
        headers={"Authorization": f"Bearer {token}"},
        json={"query": "query($u:String!){user(login:$u){createdAt}}", "variables": {"u": username}},
        timeout=10,
    )
    response.raise_for_status()
    return int(response.json()["data"]["user"]["createdAt"][:4])


def fetch_github_wrapped_data(profile: GithubProfile, range_key: str = "year") -> dict:
    token = decrypt_token(profile.encrypted_token)
    now = datetime.now(timezone.utc)

    if range_key == "lifetime":
        member_since = _created_at_year(token, profile.github_username)
        merged = {"prs": 0, "issues": 0, "repos": 0, "contrib": 0}
        all_days = []
        raw = None
        for year in range(member_since, now.year + 1):
            win_from = datetime(year, 1, 1, tzinfo=timezone.utc)
            win_to = min(datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc), now)
            raw = _query(token, profile.github_username, win_from, win_to)
            c = raw["contributionsCollection"]
            merged["prs"] += c["totalPullRequestContributions"]
            merged["issues"] += c["totalIssueContributions"]
            merged["repos"] += c["totalRepositoryContributions"]
            merged["contrib"] += c["contributionCalendar"]["totalContributions"]
            all_days.extend(d for w in c["contributionCalendar"]["weeks"] for d in w["contributionDays"])
        return _process_raw_data(raw, all_days_override=all_days, totals_override=merged)

    win_from = now - timedelta(days=RANGE_DAYS.get(range_key, 365))
    raw = _query(token, profile.github_username, win_from, now)

    return _process_raw_data(raw)


def _process_raw_data(raw: dict, all_days_override=None, totals_override=None) -> dict:
    contributions = raw["contributionsCollection"]
    calendar = contributions["contributionCalendar"]

    all_days = all_days_override if all_days_override is not None else [
        day
        for week in calendar["weeks"]
        for day in week["contributionDays"]
    ]
    totals = totals_override or {
        "prs": contributions["totalPullRequestContributions"],
        "issues": contributions["totalIssueContributions"],
        "repos": contributions["totalRepositoryContributions"],
        "contrib": calendar["totalContributions"],
    }

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
    weekday_commits = totals["contrib"] - weekend_commits
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
        "total_contributions": totals["contrib"],
        "longest_streak": longest_streak,
        "top_language": top_language,
        "top_repos": [r["name"] for r in raw["repositories"]["nodes"][:5]],

        # Naye stats
        "total_prs": totals["prs"],
        "total_issues": totals["issues"],
        "total_repos_created": totals["repos"],
        "most_active_day": most_active_day,
        "is_weekend_warrior": is_weekend_warrior,
        "most_starred_repo": most_starred[0],
        "most_starred_repo_stars": most_starred[1],
        "followers_count": raw["followers"]["totalCount"],
        "calendar_days": [
            {
                "date": day["date"],
                "count": day["contributionCount"],
                "weekday": day["weekday"],
                "level": {
                    "NONE": 0, "FIRST_QUARTILE": 1, "SECOND_QUARTILE": 2,
                    "THIRD_QUARTILE": 3, "FOURTH_QUARTILE": 4,
                }.get(day["contributionLevel"], 0),
            }
            for day in all_days
        ],

        "generated_at": datetime.utcnow().isoformat(),
    }