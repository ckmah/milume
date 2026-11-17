# Use with AI agents

Install the [use-milume](https://github.com/ckmah/milume/blob/main/skills/use-milume/SKILL.md) skill so your agent knows LandmarksWidget workflows and the public API:

```bash
npx skills add ckmah/milume --skill use-milume
```

In Claude Code:

```
/plugin marketplace add ckmah/milume
/plugin install use-milume@milume
```

After `pip install milume`, copy the skill that matches your installed version (stdlib only, no Node):

```bash
python -m milume.skill install
```

Optional target directory and overwrite:

```bash
python -m milume.skill install ./.agents/skills --force
```
