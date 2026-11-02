import json

import pytest
import requests

from copilot.paypal_client import PayPalClient


def http_error(status: int) -> requests.HTTPError:
    resp = requests.Response()
    resp.status_code = status
    return requests.HTTPError(response=resp)


@pytest.fixture
def client():
    return PayPalClient("id", "secret")  # nothing is called over the network in these tests


def test_reads_parse_the_toolkit_json(client):
    assert client._read(lambda c, p: json.dumps({"items": [p]}), {"a": 1}) == {"items": [{"a": 1}]}


def test_unknown_dispute_is_a_lookup_error(client):
    def missing(c, p):
        raise http_error(404)

    with pytest.raises(LookupError):
        client._read(missing, {})


def test_malformed_id_is_a_lookup_error_before_any_call(client):
    from paypal_agent_toolkit.shared.disputes.tool_handlers import get_dispute

    with pytest.raises(LookupError):
        client._read(get_dispute, {"dispute_id": "bad id!"})


def test_one_retry_after_a_sandbox_503(client, monkeypatch):
    monkeypatch.setattr("copilot.paypal_client.time.sleep", lambda s: None)
    calls = []

    def flaky(c, p):
        calls.append(1)
        if len(calls) == 1:
            raise http_error(503)
        return "{}"

    assert client._read(flaky, {}) == {}
    assert len(calls) == 2


def test_live_paypal_is_refused():
    with pytest.raises(ValueError):
        PayPalClient("id", "secret", "https://api-m.paypal.com")
