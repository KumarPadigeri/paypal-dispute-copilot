"""The chat client for this project's own Foundry deployment (auth: `az login`)."""

import os

from agent_framework.openai import OpenAIChatCompletionClient
from azure.identity import AzureCliCredential
from dotenv import load_dotenv


def make_client() -> OpenAIChatCompletionClient:
    load_dotenv()
    endpoint = os.getenv("FOUNDRY_ENDPOINT")
    if not endpoint:
        raise RuntimeError("Missing FOUNDRY_ENDPOINT in .env")
    return OpenAIChatCompletionClient(
        model=os.getenv("FOUNDRY_DEPLOYMENT", "gpt-5.4-mini"),
        base_url=f"{endpoint.rstrip('/')}/openai/v1",
        credential=AzureCliCredential(),
    )
