# Postman collection

`dispute-copilot.postman_collection.json` is the Dispute Copilot API with a test on every request.

**Import:** Postman → Import → this file. It points at the live demo
(`https://dispute-copilot-zi8a.onrender.com`; the free plan can take about a minute to wake).
For a local server, set the collection variable `baseUrl` to `http://localhost:8000`.

| Folder | Needs | What it does |
|---|---|---|
| 1 · Read | nothing | Health, PayPal's reasons, the dispute list, one case with its numbered evidence, a 404 for an unknown case, demo status |
| 2 · Draft | nothing (replay) or `demoPin` (live AI) | The Writer → Verifier stream as server-sent events |
| 3 · Act | `demoPin` and `actDisputeId` | Really changes that sandbox case: send the verified reply, refund now, or offer a refund after return |

`demoPin` and `actDisputeId` are empty on purpose, so nothing is changed by accident. The one
request in Act that runs without them uses a case id that doesn't exist.

**From the command line** (the safe requests only):

```sh
npx newman@6.2.1 run docs/postman/dispute-copilot.postman_collection.json \
  --folder "1 · Read (no PIN)" --folder "Without a PIN, sending is refused"
```
