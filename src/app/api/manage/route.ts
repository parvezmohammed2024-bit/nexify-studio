import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, requireProject } from "@/lib/server/auth";
import { checkMutation, checked, failure, jsonBody } from "@/lib/server/http";
import { adminDb } from "@/lib/supabase/server";
import { AppError, pricingSchema } from "@/lib/domain";
const text = (max = 3000) => z.string().trim().max(max);
export async function POST(request: Request) {
  try {
    checkMutation(request);
    const body = z
      .object({ action: z.string(), values: z.record(z.string(), z.unknown()) })
      .parse(await jsonBody(request));
    const { db, user, profile } = await requireStaff();
    const v = body.values;
    if (body.action === "client") {
      const values = z
        .object({
          name: text(200).min(1),
          industry: text(100),
          contact_email: z.union([z.email(), z.literal("")]),
          contact_phone: text(60),
          notes: text(),
          logo_asset_id: z.uuid().nullable().default(null),
          product_reference_ids: z.array(z.uuid()).max(20).default([]),
          colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(8),
          guidelines: text(6000),
          preferred_style: text(200),
          id: z.uuid().optional(),
        })
        .strict()
        .parse(v);
      const {
        colors,
        guidelines,
        preferred_style,
        product_reference_ids,
        id,
        ...client
      } = values;
      const assetIds = [
        ...(client.logo_asset_id ? [client.logo_asset_id] : []),
        ...product_reference_ids,
      ];
      if (assetIds.length) {
        const assets = checked(
          await db
            .from("generation_assets")
            .select("id,kind,archived")
            .in("id", [...new Set(assetIds)]),
        );
        if (
          assets.length !== new Set(assetIds).size ||
          assets.some((a) => a.kind !== "image" || a.archived)
        )
          throw new AppError(
            "Brand references must be accessible image assets.",
          );
      }
      const saved = id
        ? checked(
            await db
              .from("clients")
              .update(client)
              .eq("id", id)
              .select("id")
              .single(),
          )
        : checked(
            await db
              .from("clients")
              .insert({ ...client, created_by: user.id })
              .select("id")
              .single(),
          );
      checked(
        await db.from("brand_kits").upsert(
          {
            client_id: saved.id,
            colors,
            guidelines,
            preferred_style,
            product_reference_ids,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        ),
      );
      return NextResponse.json({ id: saved.id });
    }
    if (body.action === "project") {
      const values = z
        .object({
          name: text(200).min(1),
          client_id: z.uuid(),
          description: text(),
        })
        .strict()
        .parse(v);
      return NextResponse.json(
        checked(
          await db
            .from("projects")
            .insert({ ...values, created_by: user.id })
            .select("id")
            .single(),
        ),
      );
    }
    if (body.action === "template") {
      const values = z
        .object({
          name: text(100).min(1),
          mode: z.enum(["image", "image-to-video", "text-to-video", "b-roll"]),
          prompt: text(6000).min(3),
          negative_prompt: text().optional(),
        })
        .strict()
        .parse(v);
      return NextResponse.json(
        checked(
          await db
            .from("prompt_templates")
            .insert({ ...values, user_id: user.id })
            .select("id")
            .single(),
        ),
      );
    }
    if (body.action === "storyboard") {
      const values = z
        .object({
          id: z.uuid().optional(),
          project_id: z.uuid(),
          name: text(200).min(1),
          scenes: z
            .array(
              z.object({
                id: z.uuid(),
                title: text(200),
                prompt: text(6000),
                subject: text(200),
                location: text(200),
                lighting: text(200),
                angle: text(100),
                movement: text(100),
                mood: text(200),
                category: text(100),
                job_id: z.uuid().optional(),
                original_prompt: text(6000).optional(),
              }),
            )
            .min(1)
            .max(20),
        })
        .strict()
        .parse(v);
      await requireProject(values.project_id);
      return NextResponse.json(
        checked(
          await db
            .from("storyboards")
            .upsert({
              ...values,
              user_id: user.id,
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single(),
        ),
      );
    }
    if (profile.role !== "admin")
      throw new AppError("Administrator access required.", 403);
    const admin = adminDb();
    if (body.action === "budget") {
      const values = z
        .object({
          client_id: z.uuid().nullable(),
          limit_micros: z.number().int().min(0).max(1_000_000_000_000),
          hard_stop: z.boolean(),
        })
        .strict()
        .parse(v);
      checked(
        await admin.rpc("set_budget", {
          p_actor: user.id,
          p_client: values.client_id,
          p_limit: values.limit_micros,
          p_hard_stop: values.hard_stop,
        }),
      );
    } else if (body.action === "settings") {
      const values = z
        .object({
          usd_myr_rate: z.number().positive().max(100),
          upload_limit_mb: z.number().int().min(1).max(50),
          max_concurrent_jobs: z.number().int().min(1).max(20),
          default_image_model: z.uuid().nullable(),
          default_video_model: z.uuid().nullable(),
          brand_name: text(100).min(1),
        })
        .strict()
        .parse(v);
      checked(
        await db
          .from("app_settings")
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", true),
      );
    } else if (body.action === "model") {
      const values = z
        .object({
          id: z.uuid().optional(),
          name: text(100).min(1),
          provider_model_id: z
            .string()
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/)
            .max(200),
          endpoint: z
            .string()
            .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/)
            .max(200),
          operation: z.enum([
            "text-to-image",
            "image-edit",
            "image-to-video",
            "text-to-video",
          ]),
          aspect_ratios: z.array(z.string()).max(20),
          resolutions: z.array(z.string()).max(20),
          durations: z.array(z.number().int().min(1).max(120)).max(20),
          audio: z.boolean(),
          required_fields: z.array(z.string()).max(30),
          optional_fields: z.array(z.string()).max(40),
          input_schema: z.record(z.string(), z.unknown()),
          field_map: z.record(z.string(), z.string()),
          defaults: z.record(z.string(), z.unknown()),
          pricing: pricingSchema.nullable(),
          available: z.boolean(),
          verification_status: z.enum([
            "unverified",
            "sdk-documented",
            "verified",
          ]),
          verification_source: z.url().nullable(),
          verified_at: z.iso.datetime().nullable(),
        })
        .strict()
        .parse(v);
      if (values.endpoint.includes(".."))
        throw new AppError("Unsafe endpoint.");
      if (values.verification_status === "verified") {
        if (
          !values.verification_source ||
          !values.verified_at ||
          !values.pricing ||
          !values.field_map.prompt ||
          !Object.keys(values.input_schema).length
        )
          throw new AppError(
            "Verification requires official documentation, a date, verified pricing, an input schema, and field mappings.",
          );
        for (const source of [
          values.verification_source,
          values.pricing.source,
        ]) {
          const url = new URL(source);
          if (
            url.protocol !== "https:" ||
            ![
              "open.higgsfield.ai",
              "docs.higgsfield.ai",
              "github.com",
            ].includes(url.hostname) ||
            (url.hostname === "github.com" &&
              !url.pathname.startsWith("/higgsfield-ai/"))
          )
            throw new AppError(
              "Use official Higgsfield documentation as verification evidence.",
            );
        }
        const { default: Ajv } = await import("ajv");
        new Ajv({ strict: true }).compile(values.input_schema);
      }
      const { id, ...model } = values;
      if (id)
        checked(
          await db
            .from("model_registry")
            .update({ ...model, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("id")
            .single(),
        );
      else
        checked(
          await db
            .from("model_registry")
            .insert({ ...model, provider: "higgsfield" })
            .select("id")
            .single(),
        );
    } else if (body.action === "staff") {
      const values = z
        .object({
          id: z.uuid(),
          full_name: text(100).min(1),
          role: z.enum(["admin", "creator"]),
          active: z.boolean(),
        })
        .strict()
        .parse(v);
      if (values.id === user.id && (!values.active || values.role !== "admin"))
        throw new AppError(
          "Ask another administrator to change your own admin access.",
        );
      const existing = await admin.auth.admin.getUserById(values.id);
      if (existing.error || !existing.data.user)
        throw new AppError(
          "Create or invite the user in Supabase Auth first, then provision their UUID here.",
        );
      checked(await admin.from("profiles").upsert(values));
    } else if (body.action === "membership") {
      const values = z
        .object({
          project_id: z.uuid(),
          user_id: z.uuid(),
          remove: z.boolean().default(false),
        })
        .strict()
        .parse(v);
      if (values.remove)
        checked(
          await db
            .from("project_members")
            .delete()
            .eq("project_id", values.project_id)
            .eq("user_id", values.user_id),
        );
      else
        checked(
          await db
            .from("project_members")
            .upsert({ project_id: values.project_id, user_id: values.user_id }),
        );
    } else if (body.action === "reconcile") {
      const values = z
        .object({
          generation_id: z.uuid(),
          cost_micros: z.number().int().min(0).max(1_000_000_000_000),
          evidence: text(2000).min(5),
          provider_request_id: z.string().max(200).optional(),
        })
        .strict()
        .parse(v);
      if (values.provider_request_id) {
        const { higgsfield } = await import("@/lib/providers/higgsfield");
        await higgsfield.poll(values.provider_request_id);
        checked(
          await admin
            .from("generations")
            .update({
              provider_request_id: values.provider_request_id,
              status: "queued",
              next_poll_at: new Date().toISOString(),
            })
            .eq("id", values.generation_id)
            .in("status", ["submission_unknown", "needs_review"])
            .select("id")
            .single(),
        );
        // Attaching a recovered request resumes the existing job; cost is reconciled only after confirmed outcome.
      } else {
        checked(
          await admin.rpc("reconcile_cost", {
            p_generation: values.generation_id,
            p_cost: values.cost_micros,
            p_evidence: values.evidence,
            p_actor: user.id,
          }),
        );
        checked(
          await admin
            .from("generations")
            .update({
              status: "failed",
              error_metadata: {
                code: "ADMIN_RESOLVED",
                message:
                  "Administrator verified and closed the unresolved outcome.",
              },
            })
            .eq("id", values.generation_id)
            .in("status", ["submission_unknown", "needs_review"]),
        );
      }
    } else if (body.action === "connection") {
      const provider = z
        .enum(["supabase", "higgsfield", "llm"])
        .parse(v.provider);
      if (provider === "supabase") {
        checked(await admin.from("app_settings").select("id").single());
      } else if (provider === "higgsfield") {
        // Documented read-only polling; an actual request ID is required. Never submit to test credentials.
        const id = z.string().min(1).max(200).parse(v.request_id);
        const { higgsfield } = await import("@/lib/providers/higgsfield");
        await higgsfield.poll(id);
      } else {
        throw new AppError(
          "LLM verification uses the Prompt Engineer. It may incur text-provider charges; no automatic chargeable connection test is made.",
          409,
        );
      }
    } else throw new AppError("Unknown action.");
    checked(
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "admin." + body.action,
        metadata: {},
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const { db } = await requireStaff();
    const project = new URL(request.url).searchParams.get("project");
    if (!project) throw new AppError("Project is required.");
    await requireProject(z.uuid().parse(project));
    return NextResponse.json({
      storyboards: checked(
        await db
          .from("storyboards")
          .select("*")
          .eq("project_id", project)
          .order("updated_at", { ascending: false }),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
