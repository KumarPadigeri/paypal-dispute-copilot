from copilot.settings import setting


def test_pasted_values_lose_hidden_line_breaks(monkeypatch):
    monkeypatch.setenv("SOME_KEY", "abc123\n")
    assert setting("SOME_KEY") == "abc123"


def test_blank_values_fall_back_to_the_default(monkeypatch):
    monkeypatch.setenv("SOME_KEY", "  \n")
    assert setting("SOME_KEY", "fallback") == "fallback"
    monkeypatch.delenv("SOME_KEY")
    assert setting("SOME_KEY") is None
