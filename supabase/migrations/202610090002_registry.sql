-- Official SDK README establishes example endpoints, not current pricing or complete capability schemas.
-- Preserve these installed records; no chargeable requests until administrator verifies documentation + pricing.
insert into model_registry(name,provider_model_id,endpoint,operation,verification_status,verification_source,required_fields,optional_fields)
values
('FLUX Kontext Max','flux-pro/kontext/max/text-to-image','flux-pro/kontext/max/text-to-image','text-to-image','sdk-documented','https://github.com/higgsfield-ai/higgsfield-js#text-to-image-generation',array['prompt'],array['aspect_ratio','safety_tolerance','seed']),
('Higgsfield DoP Turbo','dop-turbo','v1/image2video/dop','image-to-video','sdk-documented','https://github.com/higgsfield-ai/higgsfield-js#image-to-video-generation',array['model','prompt','input_images'],array['motions','seed','enhance_prompt'])
on conflict(provider_model_id) do nothing;
