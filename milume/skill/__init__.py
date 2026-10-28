"""Install the packaged use-milume agent skill from the wheel."""

from __future__ import annotations

import shutil
import sys
from importlib import resources
from pathlib import Path

_SKILL_RESOURCE = ("skills", "use-milume", "SKILL.md")


def packaged_skill_path() -> Path:
    """Return the on-disk path to SKILL.md inside the installed milume package."""
    ref = resources.files("milume").joinpath(*_SKILL_RESOURCE)
    if ref.is_file():
        with resources.as_file(ref) as path:
            return path.resolve()
    dev = Path(__file__).resolve().parents[2] / "skills" / "use-milume" / "SKILL.md"
    if dev.is_file():
        return dev.resolve()
    raise SystemExit(
        "packaged use-milume skill not found; reinstall milume or run from a source checkout"
    )


def install_skill(dest_dir: Path, *, force: bool = False) -> Path:
    """Copy SKILL.md to ``dest_dir/use-milume/SKILL.md``."""
    dest_dir = dest_dir.expanduser().resolve()
    target = dest_dir / "use-milume" / "SKILL.md"
    if target.exists() and not force:
        raise SystemExit(
            f"{target} already exists; pass --force to overwrite"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    src = packaged_skill_path()
    shutil.copy2(src, target)
    return target


def _main(argv: list[str] | None = None) -> None:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in ("-h", "--help"):
        print(
            "Usage: python -m milume.skill\n"
            "       python -m milume.skill install [DIR] [--force]\n"
            "\n"
            "Without subcommands, prints the packaged SKILL.md path.\n"
            "install copies it to DIR/use-milume/SKILL.md (default ./.agents/skills).",
            file=sys.stderr,
        )
        raise SystemExit(0 if not args else 2)

    if args[0] != "install":
        print(f"unknown command: {args[0]!r}", file=sys.stderr)
        raise SystemExit(2)

    rest = args[1:]
    force = False
    if "--force" in rest:
        force = True
        rest = [a for a in rest if a != "--force"]
    dest = Path(rest[0]) if rest else Path(".agents/skills")
    if len(rest) > 1:
        print("too many arguments", file=sys.stderr)
        raise SystemExit(2)
    target = install_skill(dest, force=force)
    print(target)


def main() -> None:
    if len(sys.argv) == 1:
        print(packaged_skill_path())
        return
    _main()


if __name__ == "__main__":
    main()
