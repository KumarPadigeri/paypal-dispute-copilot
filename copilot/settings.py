"""Read settings from the environment (and .env locally).

Values are stripped: a key pasted into a host's dashboard often carries a hidden
line break, which breaks HTTP headers with a vague "Connection error".
"""

import os

from dotenv import load_dotenv

load_dotenv()


def setting(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    value = value.strip()
    return value or default
