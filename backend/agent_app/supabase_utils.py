from __future__ import annotations

import importlib
from typing import Any, Optional


def get_supabase_client_optional() -> Optional[Any]:
    try:
        module = importlib.import_module("supabase_client")
        getter = getattr(module, "get_supabase_client", None)
        if getter is None:
            return None
        return getter()
    except Exception:
        return None


__all__ = ["get_supabase_client_optional"]
