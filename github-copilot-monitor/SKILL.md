---
name: github-copilot-monitor
description: Retrieve and monitor GitHub Copilot usage and billing information from the user's GitHub account using GitHub API.
---

# GitHub Copilot Monitor

This Skill allows the user to check GitHub Copilot usage and billing details by integrating with the GitHub API.

## Features
- Monitor GitHub Copilot usage statistics (e.g., credits spent).
- Retrieve current GitHub Copilot plan details.
- Ensure that the user stays within their usage limits.

## Setup Instructions
1. **Generate a GitHub Personal Access Token (PAT):**  
   - Visit https://github.com/settings/tokens.
   - Generate a new token and ensure it has the required permissions for `read:org`, `read:user` and billing.

2. **Configure the Skill:**
   - Add the token as an environment variable named `GITHUB_PAT` or store it securely within OpenClaw settings.

3. **Install required dependencies:**
   - Ensure Python 3 is installed on your system.
   - Install the `requests` library using the following command:
   ```bash
   pip install requests
   ```

## Usage Scenarios
This Skill will be utilized whenever the user requests information about:
1. GitHub Copilot usage statistics.
2. Current GitHub Copilot billing plan.
3. Monthly utilization data for budgeting purposes.

## Example Queries
- "How many GitHub Copilot credits did I use last month?"
- "What's my current GitHub Copilot subscription plan?"
- "Let me know if I exceed my GitHub Copilot usage limit."

