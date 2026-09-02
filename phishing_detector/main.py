"""Command-line front-end for the phishing URL detector."""

import sys

from detector import format_result, score_url


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv

    if argv:
        url = argv[0]
    else:
        url = input("Enter a URL: ")

    result = score_url(url)

    print("\n--- RESULT ---")
    print(format_result(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
