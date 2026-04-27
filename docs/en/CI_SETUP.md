# CI Pipeline Setup

## GitHub Actions

The workflow at `.github/workflows/ci.yml` runs all Vitest tests on every PR to `main`.

## Branch Protection (one-time setup)

1. Go to **Settings → Branches → Add classic branch protection rule**
2. Branch name pattern: `main`
3. Enable **"Require a pull request before merging"**
4. Enable **"Require status checks to pass before merging"**
   - Enable "Require branches to be up to date before merging"
   - Search and select the **"test"** check (appears after first PR triggers the workflow)
5. Save
