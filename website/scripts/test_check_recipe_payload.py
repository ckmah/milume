#!/usr/bin/env python3
from __future__ import annotations

import pytest

from check_recipe_payload import (
    MAX_DATA_BYTES,
    MAX_TOTAL_BYTES,
    evaluate_report,
    format_breakdown,
)


def _sample_report(*, data: int, total: int) -> dict:
    return {
        "data_transfer_bytes": data,
        "total_transfer_bytes": total,
        "by_category": {
            "widget_js": 4_900_000,
            "marimo_runtime": 4_350_000,
            "widget_state_and_data": data,
            "zensical_site": 350_000,
            "fonts": 0,
            "other": max(0, total - data - 4_900_000 - 4_350_000 - 350_000),
        },
    }


def test_evaluate_report_ok_under_both_limits() -> None:
    report = _sample_report(data=130_000, total=9_800_000)
    assert evaluate_report(report) == []


def test_evaluate_report_fails_data_budget() -> None:
    report = _sample_report(data=MAX_DATA_BYTES + 1, total=MAX_TOTAL_BYTES - 1)
    failures = evaluate_report(report)
    assert len(failures) == 1
    assert "data" in failures[0]


def test_evaluate_report_fails_total_budget() -> None:
    report = _sample_report(data=MAX_DATA_BYTES - 1, total=MAX_TOTAL_BYTES + 1)
    failures = evaluate_report(report)
    assert len(failures) == 1
    assert "total" in failures[0]


def test_evaluate_report_fails_both_limits() -> None:
    report = _sample_report(data=MAX_DATA_BYTES + 1, total=MAX_TOTAL_BYTES + 1)
    failures = evaluate_report(report)
    assert len(failures) == 2


def test_format_breakdown_lists_categories() -> None:
    report = _sample_report(data=100, total=200)
    text = format_breakdown(report)
    assert "widget_state_and_data" in text
    assert "total transfer" in text
