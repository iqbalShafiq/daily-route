# Cheapest OpenRouter endpoint per request

## The question

The model is fixed (`deepseek/deepseek-v4.1-flash-1017`), but OpenRouter serves
it from many providers with different prices. Can each request go to the
cheapest one, using live prices, without hard-coding a provider?

## What the router offers

- `provider.sort: "price"` disables load balancing and tries providers in
  price order.
- `provider.order` is a static list; it does not follow a price change.
- `provider.max_price` caps the price and fails rather than overspends.
- `:floor` is the slug shortcut for price sorting plus flex-tier eligibility.
- `provider.allow_fallbacks` keeps the request alive when the first provider
  is down; `require_parameters` excludes providers that would ignore tools or
  the output schema.

The official docs describe `sort: "price"` as lowest price, but a probe with
this model showed it ranked by the **prompt** price: it chose OpenInference
($0.02/M prompt, $1/M completion) over InferenceNet ($0.08/M prompt, $0.5/M
completion), even for a short answer where InferenceNet was cheaper in total.

## What this app does

`packages/agent/src/provider-routing.ts` wraps the completion model:

1. Read `GET /api/v1/models/{model}/endpoints` and cache the prices for 60 s.
2. Estimate the request's input tokens from the instructions, messages, tool
   descriptions and documents. Use the request's `maxTokens` as the output
   budget.
3. Compute `prompt × input + completion × output` for every provider and put
   the cheapest five in `provider.order`, with `allow_fallbacks: true` and
   `require_parameters: true`.
4. If the price list cannot be read, keep OpenRouter's `sort: "price"` as the
   fallback.

The price is therefore re-evaluated per request (at most a minute stale), and
a provider that raises its price stops being first without a deploy. The model
id never changes.

## Test

A simple request through the model factory picked **Sail Research** (prompt
$0.101/M, completion $0.15/M) instead of the default InferenceNet ($0.08/M,
$0.5/M): with a 16k output budget, Sail is cheaper in total. The direct
`sort: "price"` request still picked OpenInference, whose prompt is cheapest
but whose completion is the most expensive.

## Caveat

The router ranks by the **worst-case** output budget, not by the actual answer
length. That is deliberate: an unexpectedly long answer must not cost more
than the provider that was chosen. A provider with a very low completion
price may be a smaller, quantized endpoint; `require_parameters` removes the
ones that cannot honour tools, but it does not measure answer quality. If
quality becomes a concern, a benchmark gate is the next step, not a static
provider list.
