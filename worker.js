export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return createJsonResponse(
        {
          success: false,
          error: "Method not allowed. Use POST.",
        },
        405,
        corsHeaders,
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return createJsonResponse(
        {
          success: false,
          error: "Invalid JSON body.",
        },
        400,
        corsHeaders,
      );
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const products = Array.isArray(body.products) ? body.products : [];

    if (messages.length === 0) {
      return createJsonResponse(
        {
          success: false,
          error: "At least one message is required.",
        },
        400,
        corsHeaders,
      );
    }

    const systemMessage = {
      role: "system",
      content:
        "You are a helpful L'Oreal routine advisor. Use selected products when provided. Keep answers clear, practical, and beginner-friendly.",
    };

    const latestUserMessage = getLatestUserMessage(messages);
    const searchQuery = buildSearchQuery(latestUserMessage, products);
    const citations = await getWebSearchResults(searchQuery, 5);

    const citationsPrompt = citations.length
      ? buildCitationsPrompt(citations)
      : "No web search sources were found. Give your best answer and clearly say that no external sources were available.";

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            systemMessage,
            { role: "system", content: citationsPrompt },
            ...messages,
          ],
          temperature: 0.7,
        }),
      },
    );

    const openAiData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      return createJsonResponse(
        {
          success: false,
          error: openAiData.error
            ? openAiData.error.message
            : "OpenAI request failed.",
          metadata: {
            provider: "openai",
            status: openAiResponse.status,
            timestamp: new Date().toISOString(),
          },
        },
        openAiResponse.status,
        corsHeaders,
      );
    }

    const routineText =
      openAiData.choices &&
      openAiData.choices[0] &&
      openAiData.choices[0].message &&
      openAiData.choices[0].message.content
        ? openAiData.choices[0].message.content
        : "";

    if (!routineText) {
      return createJsonResponse(
        {
          success: false,
          error: "No routine text returned from OpenAI.",
          metadata: {
            provider: "openai",
            timestamp: new Date().toISOString(),
          },
        },
        502,
        corsHeaders,
      );
    }

    const routineTextWithCitations = citations.length
      ? `${routineText.trim()}\n\nSources:\n${formatCitationsList(citations)}`
      : routineText;

    return createJsonResponse(
      {
        success: true,
        routine: {
          text: routineTextWithCitations,
          citations,
        },
        metadata: {
          provider: "openai",
          model: openAiData.model || "gpt-4o",
          timestamp: new Date().toISOString(),
          selectedProductCount: products.length,
          messageCount: messages.length,
          searchQuery,
          citationCount: citations.length,
        },
      },
      200,
      corsHeaders,
    );
  },
};

function getLatestUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (
      messages[i].role === "user" &&
      typeof messages[i].content === "string"
    ) {
      return messages[i].content;
    }
  }

  return "";
}

function buildSearchQuery(latestUserMessage, products) {
  const topProducts = products
    .slice(0, 3)
    .map((product) => `${product.brand} ${product.name}`)
    .join(" ");

  const queryParts = [latestUserMessage, topProducts, "skincare routine advice"]
    .filter(Boolean)
    .join(" ");

  return queryParts.slice(0, 300);
}

async function getWebSearchResults(query, maxResults) {
  if (!query) {
    return [];
  }

  const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "loreal-routine-builder-worker/1.0",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const results = [];

    if (data.AbstractURL && data.AbstractText) {
      results.push({
        title: data.Heading || "DuckDuckGo Result",
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    const flatTopics = flattenDuckDuckGoTopics(data.RelatedTopics || []);

    for (const topic of flatTopics) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: extractTitleFromText(topic.Text),
          url: topic.FirstURL,
          snippet: topic.Text,
        });
      }
    }

    const deduped = [];
    const seenUrls = new Set();

    for (const result of results) {
      if (!result.url || seenUrls.has(result.url)) {
        continue;
      }

      seenUrls.add(result.url);
      deduped.push(result);

      if (deduped.length >= maxResults) {
        break;
      }
    }

    return deduped.map((result, index) => ({
      id: index + 1,
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      source: "DuckDuckGo",
    }));
  } catch {
    return [];
  }
}

function flattenDuckDuckGoTopics(topics) {
  const flattened = [];

  for (const topic of topics) {
    if (topic.Topics && Array.isArray(topic.Topics)) {
      flattened.push(...topic.Topics);
    } else {
      flattened.push(topic);
    }
  }

  return flattened;
}

function extractTitleFromText(text) {
  const dashIndex = text.indexOf(" - ");

  if (dashIndex === -1) {
    return text.slice(0, 80);
  }

  return text.slice(0, dashIndex);
}

function buildCitationsPrompt(citations) {
  const citationBlock = citations
    .map(
      (citation) =>
        `[${citation.id}] ${citation.title}\nURL: ${citation.url}\nSummary: ${citation.snippet}`,
    )
    .join("\n\n");

  return `Use these live web search sources in your answer. Include bracket citations like [1], [2] in the relevant sentences. If a claim is from a source, cite it.\n\nWeb search results:\n${citationBlock}`;
}

function formatCitationsList(citations) {
  return citations
    .map((citation) => `[${citation.id}] ${citation.title} - ${citation.url}`)
    .join("\n");
}

function createJsonResponse(payload, status, corsHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}
