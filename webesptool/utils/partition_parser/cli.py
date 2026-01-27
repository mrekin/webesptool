"""
CLI interface for ESP-IDF Partition Table parser.
"""

import argparse
import sys
from pathlib import Path

from .formatters import format_analysis, format_csv, format_json, format_text
from .parser import ParseError, parse_partitions_file
from .validator import ValidationError


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Parse ESP-IDF partition table binary files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s partitions.bin
  %(prog)s partitions.bin --format csv --output output.csv
  %(prog)s partitions.bin --format json --verbose
  %(prog)s partitions.bin --format csv > output.csv
        """,
    )

    parser.add_argument(
        "input",
        help="Path to partitions.bin file",
    )

    parser.add_argument(
        "--format",
        "-f",
        choices=["json", "csv", "text", "analysis"],
        default="json",
        help="Output format (default: json)",
    )

    parser.add_argument(
        "--output",
        "-o",
        help="Output file path (if not specified, prints to stdout)",
    )

    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output (only for text format)",
    )

    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip partition table validation",
    )

    args = parser.parse_args()

    try:
        # Parse partition table
        table = parse_partitions_file(args.input)

        # Validate unless explicitly disabled
        if not args.no_validate:
            from .validator import validate_partition_table

            validate_partition_table(table)
            if args.verbose:
                print(f"Validated {len(table.entries)} partition entries", file=sys.stderr)

        # Generate output
        if args.format == "json":
            output = format_json(table, human_readable=True, indent=2)
        elif args.format == "csv":
            output = format_csv(table)
        elif args.format == "analysis":
            output = format_analysis(table, indent=2)
        else:  # text
            output = format_text(table, verbose=args.verbose)

        # Write to file or stdout
        if args.output:
            output_path = Path(args.output)
            output_path.write_text(output)
            if args.verbose:
                print(f"Output written to {args.output}", file=sys.stderr)
        else:
            print(output)

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except ParseError as e:
        print(f"Parse error: {e}", file=sys.stderr)
        sys.exit(1)
    except ValidationError as e:
        print(f"Validation error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
