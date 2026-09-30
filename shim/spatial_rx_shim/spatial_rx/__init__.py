"""Deprecated alias for :mod:`milume` (formerly spatial-rx)."""

import importlib
import pkgutil
import sys
import warnings

import milume
from milume import *  # noqa: F401,F403
from milume import __all__, __version__  # noqa: F401

warnings.warn(
    "spatial_rx has been renamed to milume. Run `pip install milume` and "
    "`import milume`; the spatial-rx package will not be updated again.",
    DeprecationWarning,
    stacklevel=2,
)

# Alias submodules (spatial_rx.measure, ...) to the milume modules so both
# names share one module object.
for _info in pkgutil.iter_modules(milume.__path__):
    if _info.name == "static":
        continue
    _mod = importlib.import_module(f"milume.{_info.name}")
    sys.modules[f"{__name__}.{_info.name}"] = _mod
    globals()[_info.name] = _mod
