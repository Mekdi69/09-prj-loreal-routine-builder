# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Cloudflare Worker API Setup

All AI requests should go through your Cloudflare Worker so the OpenAI API key is never exposed in browser code.

1. Deploy the Worker in [worker.js](worker.js).
2. In Cloudflare Workers, add a secret named `OPENAI_API_KEY`.
3. Route the frontend to your Worker URL by setting a global `CLOUDFLARE_WORKER_URL` in a local config file, or use the default same-origin route `/api/routine`.

Expected Worker response shape:

```json
{
  "success": true,
  "routine": {
    "text": "Morning:\n1. ..."
  },
  "metadata": {
    "provider": "openai",
    "model": "gpt-4o",
    "timestamp": "2026-04-13T00:00:00.000Z",
    "selectedProductCount": 3,
    "messageCount": 5
  }
}
```
