# list-github-forks

A little node.js script that lists active forks and what branches are being
worked on.. Very useful when a project has too many forks for github to show
the network graph.

No dependencies, tested v0.10.25.

## Usage

Usage: nodejs user repo [maxforks]

The github API has very low limits for unauthenticated users, you probably want
to place a Personal Access Token in ./.ghtoken with this format:

    format <username>:<token>

Create a token: https://github.com/settings/tokens

By default, this script will list 32 forks. Each fork requires on API call, and
the maximum unauthenticated calls is 50 per hour. Once you place a token in
.ghtoken, the limit is 5000 calls.

What this script actually does: Get a repo's forks, sort them by last activity
time, show branches they don't share with their parents

## Future work

This would be nice:

* Don't show forks that don't have interesting branches.
* On large projects, fetching the list of forks can take a long time, it should
  be more verbose.
* Remove request rate limiting?
* After the origin merges a branch, it will show up as an "interesting branch"
  until the forks pull the merge. How to detect this without making too many
  API calls?
* A web front-end.
