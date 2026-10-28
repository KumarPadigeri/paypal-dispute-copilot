"""The chat client for this project's own Foundry deployment.

Auth: FOUNDRY_API_KEY when set (the hosted app, key kept in the host's secret
settings), otherwise your `az login` (local development).
"""

from agent_framework.openai import OpenAIChatCompletionClient
from azure.identity import AzureCliCredential

from copilot.settings import setting


def make_client() -> OpenAIChatCompletionClient:
    endpoint = setting("FOUNDRY_ENDPOINT")
    if not endpoint:
        raise RuntimeError("Missing FOUNDRY_ENDPOINT in .env")
    key = setting("FOUNDRY_API_KEY")
    auth = {"api_key": key} if key else {"credential": AzureCliCredential()}
    return OpenAIChatCompletionClient(
        model=setting("FOUNDRY_DEPLOYMENT", "gpt-5.4-mini"),
        base_url=f"{endpoint.rstrip('/')}/openai/v1",
        **auth,
    )
