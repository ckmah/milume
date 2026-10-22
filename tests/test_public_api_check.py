import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("public_api", ROOT / "scripts" / "public_api.py")
public_api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public_api)


def snap(exports=None, traits=None, internal=None):
    return {
        "public": {"exports": exports or {}, "traits": traits or {}},
        "internal": {"traits": internal or {}},
    }


def test_public_and_internal_changes_are_split():
    old = snap(traits={"color": "trait Unicode"}, internal={"gene_columns": "trait List"})
    new = snap(traits={"color": "trait Unicode", "point_size": "trait Float"}, internal={"gene_names": "trait List"})
    assert public_api.diff(old, new) == [
        ("public", "+", "traits.point_size: trait Float"),
        ("internal", "-", "traits.gene_columns: trait List"),
        ("internal", "+", "traits.gene_names: trait List"),
    ]


def test_signature_change_is_reported():
    old = snap(exports={"peek": "(data, **kwargs)"})
    new = snap(exports={"peek": "(data, *, color=None)"})
    assert public_api.diff(old, new) == [("public", "~", "exports.peek: (data, **kwargs) -> (data, *, color=None)")]

