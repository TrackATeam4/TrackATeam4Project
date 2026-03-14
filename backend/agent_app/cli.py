from __future__ import annotations

import argparse
from typing import List, Optional, Sequence

from .runtime import run_prompt
from .tools import list_tool_names


def parse_tool_names(value: str) -> Optional[List[str]]:
    """Parse comma-separated tool names; 'all' means no filtering."""
    stripped = value.strip()
    if not stripped or stripped.lower() == "all":
        return None
    return [name.strip() for name in stripped.split(",") if name.strip()]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the Bedrock ReAct agent with configurable tools.")
    parser.add_argument("prompt", nargs="*", help="Prompt to send to the agent.")
    parser.add_argument(
        "--tools",
        default="all",
        help="Comma-separated tool names (default: all). Use --list-tools to inspect names.",
    )
    parser.add_argument("--list-tools", action="store_true", help="Print available tool names and exit.")
    parser.add_argument("--no-stream", action="store_true", help="Disable streaming output.")
    parser.add_argument("--model", default=None, help="Bedrock model ID override.")
    parser.add_argument("--region", default=None, help="AWS region override.")
    parser.add_argument("--temperature", type=float, default=0, help="Model temperature.")
    parser.add_argument("--max-tokens", type=int, default=None, help="Maximum generated tokens.")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.list_tools:
        for name in list_tool_names():
            print(name)
        return 0

    prompt = " ".join(args.prompt).strip()
    if not prompt:
        parser.error("Please provide a prompt, e.g.: python agent.py 'What is 5 * 5?'")

    tool_names = parse_tool_names(args.tools)
    run_prompt(
        prompt=prompt,
        tool_names=tool_names,
        stream=not args.no_stream,
        model=args.model,
        region_name=args.region,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )
    return 0

