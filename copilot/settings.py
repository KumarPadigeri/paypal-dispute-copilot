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


# Where buyers send returns. Sandbox demo default: a made-up address, never a real person's.
DEMO_RETURN_ADDRESS = "500 Demo Street|San Jose|CA|95110|US"


def return_address() -> dict:
    """RETURN_ADDRESS="line 1|city|state|postal code|country" as PayPal's address object."""
    line1, city, state, postal, country = (
        part.strip() for part in setting("RETURN_ADDRESS", DEMO_RETURN_ADDRESS).split("|")
    )
    return {
        "address_line_1": line1,
        "admin_area_2": city,
        "admin_area_1": state,
        "postal_code": postal,
        "country_code": country,
    }
