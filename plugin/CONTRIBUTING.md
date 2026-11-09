# Adding to the plugin

The plugin is prose, not code, so most changes are one file.

## When the SDK gains a resource

Add it to `skills/nixet-sdk/references/api.md` and to the table in that skill's
`SKILL.md`. That is usually the whole change: the task skills describe *how to
think* about a job and defer the surface area to the reference, so they do not
need editing every time a method appears.

## When to add a skill instead

Add one when a distinct job needs judgement, not when a resource appears. The
test is whether the guidance would be ignored if it were a paragraph inside an
existing skill.

```
skills/nixet-<verb>-<noun>/
  SKILL.md              # what to decide, and why
  references/*.md       # detail loaded only when needed
```

Naming is `nixet-<verb>-<noun>`, so the prefix keeps the skills together and the
verb says when to reach for it.

Frontmatter `description` is the only thing the model sees before loading the
skill, so write it as a trigger rather than a summary: name the words a user
would actually type.

## When to add a subagent

When a job spans many steps and benefits from its own context, as
`nixet-agent-builder` does. A skill that only explains one call does not.

## Keeping it honest

- Every example must be something you have run. A plausible call that does not
  resolve is worse than no example.
- Prefer showing the failure mode. The debug skill exists because "the agent
  ignored its tool" is a real thing people hit.
- Do not restate the SDK's types. They are in the reference; the skill should
  say when and why.

## Checking a change

```bash
claude plugin validate ./plugin
claude --plugin-dir ./plugin     # loads it without installing
```

Skill edits take effect in the next session. Manifest, agent and hook changes
need `/reload-plugins` or a restart.
