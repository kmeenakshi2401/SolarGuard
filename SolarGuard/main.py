"""SolarGuard — Entry point for launching the Streamlit dashboard or running self-checks."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def launch_dashboard() -> int:
    app_path = Path(__file__).resolve().parent / "dashboard" / "app.py"
    cmd = [sys.executable, "-m", "streamlit", "run", str(app_path)]
    print(f"Launching SolarGuard Dashboard: {' '.join(cmd)}")
    return subprocess.call(cmd)


def run_tests() -> int:
    tests_dir = Path(__file__).resolve().parent / "tests"
    cmd = [sys.executable, "-m", "unittest", "discover", "-s", str(tests_dir), "-v"]
    return subprocess.call(cmd)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="SolarGuard — Intelligent Solar Panel Monitoring & Selective Cleaning System"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run the unit test suite instead of launching the Streamlit dashboard.",
    )
    args = parser.parse_args()

    exit_code = run_tests() if args.test else launch_dashboard()
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
