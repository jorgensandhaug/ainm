from __future__ import annotations

from astar.cli import build_parser


def test_cli_accepts_evidence_field_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "evidence_field_blend_v2",
        ],
    )

    assert args.model == "evidence_field_blend_v2"


def test_cli_accepts_evidence_field_live_online_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-live-online",
            "--model",
            "evidence_field_blend_v2",
        ],
    )

    assert args.model == "evidence_field_blend_v2"


def test_cli_accepts_transcript_memory_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "transcript_memory_v2",
        ],
    )

    assert args.model == "transcript_memory_v2"


def test_cli_accepts_transcript_residual_memory_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "transcript_residual_memory_v2",
        ],
    )

    assert args.model == "transcript_residual_memory_v2"


def test_cli_accepts_transcript_sequence_residual_memory_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "transcript_sequence_residual_memory_v2",
        ],
    )

    assert args.model == "transcript_sequence_residual_memory_v2"


def test_cli_accepts_transcript_sequence_factor_residual_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "transcript_sequence_factor_residual_v2",
        ],
    )

    assert args.model == "transcript_sequence_factor_residual_v2"


def test_cli_accepts_round_transcript_residual_memory_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "round_transcript_residual_memory_v2",
        ],
    )

    assert args.model == "round_transcript_residual_memory_v2"


def test_cli_accepts_round_transcript_factor_residual_historical_benchmark_model() -> None:
    parser = build_parser()

    args = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "round_transcript_factor_residual_v2",
        ],
    )

    assert args.model == "round_transcript_factor_residual_v2"
