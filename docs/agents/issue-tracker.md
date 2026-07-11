# Issue tracker: local markdown

Issues for this repo live as markdown files under `.scratch/issues/`.

## File format

Each issue is one file: `.scratch/issues/<id>-<slug>.md`. The id is a zero-padded
sequential number. The slug is a kebab-case title hint.

Front matter carries the tracker metadata:

```yaml
---
id: 0001
title: "Human-readable title"
type: map | research | prototype | grilling | task
parent: <map id>          # null for the map itself
blocked_by: [<id>, ...]   # native blocking; frontier = open, unblocked, unclaimed
assigned: <gh-username>   # null = unclaimed
status: open | closed
---
```

The body is the issue content (see below).

## Map issue

The map is the issue with `type: map`. Its body holds the Destination, Notes,
Decisions so far (index of closed child tickets), Not yet specified (fog), and
Out of scope. One map per effort.

## Ticket bodies

A ticket body opens with `## Question` — the decision or work this ticket
resolves. The answer is recorded as a resolution comment appended on close:

```markdown
## Resolution

<what was decided/done, with links to any assets>
```

## Wayfinding operations

- **Find the map:** the file with `type: map`.
- **List open children:** all files with `parent: <map id>` and `status: open`.
- **Frontier:** open children whose `blocked_by` are all `closed` and
  `assigned: null`.
- **Claim a ticket:** set `assigned: <you>` in its front matter before working it.
- **Block:** list ids in `blocked_by`; wire in a second pass after creation.
- **Resolve:** append `## Resolution`, set `status: closed`, add a one-line gist
  to the map's "Decisions so far" with a link to the file.