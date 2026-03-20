# Global Agent Instructions

When reporting information to me, be extremely concise and sacrifice grammar for concision.

## Astar Repo First Reads

- Start with [README.md](/home/jorge/repos/ainm/tasks/astar/README.md) for repo structure, pipelines, and operational commands.
- Read [docs/game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md) before making claims or assumptions about competition mechanics, API surface, scoring, class mapping, or replay behavior.
- Treat [docs/game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md) as canonical for external challenge facts.
- That file explicitly separates official public-doc facts from richer replay facts observed from direct platform use.
- If you change docs touching challenge rules, update [docs/game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md) first, then sync any README summary.

## Environment

Local workstation + one or more remote NixOS hosts. Config managed via NixOS flake at `~/dotfiles/nixos/`. Deploy with: `sudo nixos-rebuild switch`.

## Secrets

Dotfiles/NixOS secrets are managed with `SOPS + age` under `nixos/secrets/sops/`.

- Runtime services should read `/run/secrets/*`
- Do not add new secrets under `secrets/` in this repo
- `git-crypt` may still exist on some machines for other repos, but not for dotfiles itself
- For details: `~/dotfiles/docs/secrets.md`

## Key Paths

| Path | Purpose |
| --- | --- |
| `~/dotfiles/` | Config repo (public). Symlinked: nvim, tmux, zsh, karabiner, claude |
| `~/dotfiles/nixos/` | NixOS flake (host definitions in `flake.nix`) |
| `~/dotfiles/nixos/secrets/sops/` | SOPS-encrypted secret files |

## Shell

Zsh with `~/dotfiles/zshrc.shared`. Aliases: `lg` (lazygit), `n` (nvim), `c` (claude --dangerously-skip-permissions).

## Rules

- Never commit secrets, IPs, SSH keys.
- Shell aliases in `zshrc.shared` only, not NixOS config.
- NixOS changes go through the flake, not manual edits on VMs.
- Never use plan mode. Do not call EnterPlanMode.

## Browser Automation

- On NixOS hosts, `lightpanda` is installed via flake config.
- For raw browser automation, use `npx -y agent-browser@0.20.11 --engine lightpanda ...`
- Keep `--engine lightpanda` on every `agent-browser` command in the sequence, not just the first one.

## Task Tracking (beads)

`br` (beads) is initialized in each repo. Use it:

- `br list` - see open tasks
- `br create "title" -d "description" -l label -p 2` - create task
- `br close <id>` - mark done
- `br search <query>` - find tasks

Check `br list` when starting work to see if there are relevant tasks.
