"""The chat client for this project's own Foundry deployment.

Auth: FOUNDRY_API_KEY when set (the hosted app, key kept in the host's secret
settings), otherwise your `az login` (local development).
"""

import os

from agent_framework.openai import OpenAIChatCompletionClient
from azure.identity import AzureCliCredential
from dotenv import load_dotenv


def make_client() -> OpenAIChatCompletionClient:
    load_dotenv()
    endpoint = os.getenv("FOUNDRY_ENDPOINT")
    if not endpoint:
        raise RuntimeError("Missing FOUNDRY_ENDPOINT in .env")
    key = os.getenv("FOUNDRY_API_KEY")
    auth = {"api_key": key} if key else {"credential": AzureCliCredential()}
    return OpenAIChatCompletionClient(
        model=os.getenv("FOUNDRY_DEPLOYMENT", "gpt-5.4-mini"),
        base_url=f"{endpoint.rstrip('/')}/openai/v1",
        **auth,
    )
