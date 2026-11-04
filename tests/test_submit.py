import json
from dataclasses import replace
from pathlib import Path

import pytest

from copilot.evidence import build_case
from copilot.submit import NotSendable, build_evidences, check_message

FIXTURES = Path(__file__).parent / "fixtures"
REPLY = "The item was shipped via USPS on Oct 27, 2026. Please close the case."


def case(trackers=True):
    d = json.loads((FIXTURES / "dispute_not_received.json").read_text())
    t = json.loads((FIXTURES / "trackers.json").read_text()) if trackers else []
    return build_case(d, t)


def test_case_knows_allowed_actions_and_shipments():
    c = case()
    assert "provide_evidence" in c.actions
    assert "self" not in c.actions
    assert c.shipments == [
        {"carrier": "USPS", "tracking_number": "9400111899561234567890", "status": "SHIPPED"}
    ]


def test_payload_is_proof_of_fulfillment_with_paypal_tracking_and_the_reply():
    [ev] = build_evidences(case(), REPLY)
    assert ev["evidence_type"] == "PROOF_OF_FULFILLMENT"
    assert ev["evidence_info"]["tracking_info"] == [
        {"carrier_name": "USPS", "tracking_number": "9400111899561234567890"}
    ]
    assert ev["notes"] == REPLY


def test_unknown_carrier_is_sent_as_other():
    c = replace(case(), shipments=[{"carrier": "SOME_LOCAL_COURIER", "tracking_number": "X1"}])
    [ev] = build_evidences(c, REPLY)
    assert ev["evidence_info"]["tracking_info"][0]["carrier_name"] == "OTHER"


@pytest.mark.parametrize(
    "change, reply, message",
    [
        ({"status": "RESOLVED"}, REPLY, "not waiting for the seller"),
        ({"actions": ["send_message"]}, REPLY, "does not allow providing evidence"),
        ({}, "   ", "reply is empty"),
        ({}, "x" * 2001, "PayPal allows 2000"),
        ({"shipments": []}, REPLY, "No shipment tracking"),
    ],
)
def test_nothing_is_sent_when_a_check_fails(change, reply, message):
    with pytest.raises(NotSendable, match=message):
        build_evidences(replace(case(), **change), reply)


@pytest.mark.parametrize(
    "change, text, message",
    [
        ({"actions": ["provide_evidence"]}, REPLY, "does not allow messaging"),
        ({}, "  ", "message is empty"),
        ({}, "x" * 2001, "PayPal allows 2000"),
    ],
)
def test_message_is_not_sent_when_a_check_fails(change, text, message):
    with pytest.raises(NotSendable, match=message):
        check_message(replace(case(), **change), text)


def test_message_needs_no_tracking():
    check_message(replace(case(), shipments=[]), REPLY)  # no error
