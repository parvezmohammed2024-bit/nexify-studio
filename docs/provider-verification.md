# Provider verification record

Reviewed on 9 October 2026. Documentation verification is separate from live account access. No live generation or LLM call was made because credentials are absent.

## REST lifecycle

Sources: [official quick start](https://open.higgsfield.ai/quick-start) and [official TypeScript SDK](https://github.com/higgsfield-ai/higgsfield-js/tree/e3f274249962417e21f6566d4eecec6d8491d11c).

- Submit a direct JSON body to `POST https://api.higgsfield.ai/<documented model path>`.
- Use `Authorization: Key <complete copied API key>` on server-side requests. Paste the key as-is into `HF_API_KEY`; `HF_CREDENTIALS` is accepted as a compatibility alias. The application does not require users to split a key or invent a credential format.
- Poll `GET /requests/<request_id>/status`; documented statuses include queued, in_progress, completed, failed, nsfw, and canceled.
- Completed media is in `images[].url` or `video.url`.
- No automatic retry is made for a generation POST. Timeout, network errors, malformed success responses, and 5xx responses retain the reservation for review.
- The SDK README documents refunded credits for failed/nsfw results. Canceled results retain their reservation until billing evidence is reconciled.
- No live USD estimation endpoint or confirmed USD final-charge field was verified. The adapter therefore uses recent, verified registry prices and manual final-cost reconciliation.
- Private Supabase signed reference URLs are used; the provider can access them for one hour. The application does not use a guessed Higgsfield upload contract.

The documentation index at `https://docs.higgsfield.ai/docs/llms.txt` was blocked by the environment's network proxy. Per-model schema and LLM-readable documentation were available in the official platform's model pages and were read directly.

## Installed models

The original FLUX Kontext Max and DoP Turbo entries remain installed, disabled, and SDK-documented. They have no guessed pricing.

The additional model definitions in `verified-models.json` come from these official pages:

| Model / operation                                 | Documentation                                                                                           | Price verification                                                                                                                           | Enabled configuration                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Marketing Studio Image: text-to-image and editing | [Model reference](https://open.higgsfield.ai/models/marketing-studio/image/api-reference)               | [Official pricing](https://open.higgsfield.ai/pricing): resolution 1k, quality low, aspect ratio auto; original list price $0.0162 per image | One output, 1k, auto, low quality, enhance_prompt false, moderation auto |
| Wan 3.0 Prime: text-to-video                      | [Model reference](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/text-to-video/api-reference)  | Official pricing: 480p, 2 seconds, adaptive; original list price $0.068 per second                                                           | 2 seconds, 480p, adaptive, audio on, enable_thinking false               |
| Wan 3.0 Prime: image-to-video                     | [Model reference](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/image-to-video/api-reference) | Official pricing: same listed 480p configuration                                                                                             | Same controls plus one source image                                      |
| Z-Image Turbo                                     | [Model reference](https://open.higgsfield.ai/models/z-image/turbo/api-reference)                        | Model documentation reports public pricing unavailable                                                                                       | Installed with schema; requests disabled                                 |
| Soul 2                                            | [Model reference](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference)       | Model documentation reports public pricing unavailable                                                                                       | Installed with schema; requests disabled                                 |

Prices use the official pricing page's **original list price**, not an advertised maximum customer discount. They are shown as approximate conservative estimates, because actual account discounts and final charges have not been verified. Model-specific documents omit pricing; the public pricing page supplies the exact configurations above. The registry narrows the schemas to those priced configurations. It never extrapolates a rate to higher quality, other resolutions, longer durations, extra outputs, thinking/preset modes, or different audio settings. The reservation is $0.0162 for the image configuration and $0.136 for the two-second video configuration. Final billing must still be confirmed.

The fixed verification timestamp in migration 005 does **not** refresh itself when a migration is applied. After seven days, generation blocks until an administrator rereads the sources and verifies pricing again. `verified-models.json` records the reviewed definitions, not a live catalog updater.

## Extending a model

1. Read the model page discovered from the official explorer and its current Input JSON Schema.
2. Copy its real model ID and REST endpoint. Registry uniqueness is `(provider_model_id, operation)` so one provider route can support separate editing and image workflows.
3. Map studio fields to documented input fields. Reference encodings supported by this adapter are `url_array`, `image_url_objects`, `single_url`, and `single_image_object`.
4. Supply a strict JSON Schema. Narrow **all cost-affecting fields** to the configurations your pricing record covers. A free-form quality, enhancement, batch, audio, duration, or reference mode must never bypass the price calculation. Schema validation happens before reservation and again before submission.
5. Add recently verified per-output or per-second prices in integer USD microdollars. Use a documented safe maximum multiplier, never an invented rate. Token-metered models need another estimation strategy with verified dimensions/rules; the current adapter blocks them rather than using a false per-second conversion.
6. Set the verification source and timestamp, availability, and verification status only after those checks. Test against the account in a controlled workflow with explicit cost confirmation.
7. Configure verified output hostnames in `PROVIDER_MEDIA_HOSTS`. Downloads validate DNS and pin the selected public address, enforce HTTPS, reject redirects, sniff file types, and limit wall time and bytes. Provider credentials are never sent to media hosts.

First/last-frame, multi-shot, motion intensity, Soul ID training, and additional unpriced configurations are not enabled in the installed safe configurations. Unsupported controls are never forwarded. Adding compatible models and verified prices can extend the studios without changing the submission/budget logic.
