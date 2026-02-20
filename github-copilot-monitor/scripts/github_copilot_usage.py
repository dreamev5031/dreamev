import os
import requests

def get_copilot_usage():
    github_api_url = "https://api.github.com"
    token = os.getenv("GITHUB_PAT")

    if not token:
        raise ValueError("GitHub Personal Access Token (GITHUB_PAT) not set in environment variables!")

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }

    response = requests.get(f"{github_api_url}/user/settings/billing/copilot", headers=headers)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Error fetching GitHub Copilot usage data: {response.status_code}, {response.text}")

if __name__ == "__main__":
    try:
        usage_data = get_copilot_usage()
        print("GitHub Copilot Usage Data:", usage_data)
    except Exception as e:
        print("Error:", str(e))