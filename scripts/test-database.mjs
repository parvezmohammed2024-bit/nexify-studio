import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
for (const file of (await readdir("supabase/migrations")).sort())
  await db.exec(
    (await readFile("supabase/migrations/" + file, "utf8")).replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
const actor = "11111111-1111-4111-8111-111111111111",
  creator = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333";
await db.query(`insert into auth.users(id) values ($1),($2),($3)`, [
  actor,
  creator,
  outsider,
]);
await db.query(
  `insert into profiles(id,role,full_name) values($1,'admin','Admin'),($2,'creator','Creator'),($3,'creator','Other')`,
  [actor, creator, outsider],
);
const {
  rows: [client],
} = await db.query(
  `insert into clients(name,created_by) values('Test Client',$1) returning id`,
  [actor],
);
const {
  rows: [project],
} = await db.query(
  `insert into projects(client_id,name,created_by) values($1,'Campaign',$2) returning id`,
  [client.id, creator],
);
const {
  rows: [model],
} = await db.query(
  `update model_registry set available=true,verification_status='verified',verified_at=now() where provider_model_id='flux-pro/kontext/max/text-to-image' returning id`,
);
await db.query(`select set_budget($1,null,10000000,true)`, [actor]);
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  process.stdout.write("PASS " + name + "\n");
}
const reserve = async (key, amount = 6000000, user = creator) => {
  const {
    rows: [r],
  } = await db.query(
    `select reserve_generation($1,$2,$3,$4,'text-to-image','original','final','{}','{}',$5,'{}') as id`,
    [user, key, project.id, model.id, amount],
  );
  return r.id;
};
let job;
await test("reserve maximum atomically and deduplicate submission keys", async () => {
  job = await reserve("44444444-4444-4444-8444-444444444444");
  assert.equal(await reserve("44444444-4444-4444-8444-444444444444"), job);
  assert.equal(
    (await db.query("select count(*)::integer n from budget_reservations"))
      .rows[0].n,
    1,
  );
});
await test("reusing a submission key cannot change the payload or reserved ceiling", async () => {
  await assert.rejects(
    reserve("44444444-4444-4444-8444-444444444444", 7000000),
    /different inputs or pricing/,
  );
});
await test("hard limit includes outstanding reservations", async () => {
  await assert.rejects(
    reserve("55555555-5555-4555-8555-555555555555"),
    /budget hard limit/,
  );
});
await test("project access is enforced inside reservation RPC", async () => {
  await assert.rejects(
    reserve("66666666-6666-4666-8666-666666666666", 100000, outsider),
    /access denied/,
  );
});
await test("outstanding previous-month reservations are retained", async () => {
  await db.query(
    `update budget_reservations set billing_period='2026-01-01' where generation_id=$1`,
    [job],
  );
  await assert.rejects(
    reserve("77777777-7777-4777-8777-777777777777"),
    /budget hard limit/,
  );
});
await test("reconcile final charge once using original billing period", async () => {
  await db.query(`update generations set status='submitting' where id=$1`, [
    job,
  ]);
  await db.query(`update generations set status='storing' where id=$1`, [job]);
  await db.query(
    `update generations set status='completed',billing_period='2026-01-01' where id=$1`,
    [job],
  );
  await db.query(`select reconcile_cost($1,2000000,'Invoice verified',$2)`, [
    job,
    actor,
  ]);
  await db.query(`select reconcile_cost($1,9000000,'Duplicate callback',$2)`, [
    job,
    actor,
  ]);
  const {
    rows: [row],
  } = await db.query(
    "select amount_micros,billing_period from usage_ledger where generation_id=$1",
    [job],
  );
  assert.equal(Number(row.amount_micros), 2000000);
  assert.equal(row.billing_period.toISOString().slice(0, 10), "2026-01-01");
  assert.ok(
    (
      await db.query(
        "select released_at from budget_reservations where generation_id=$1",
        [job],
      )
    ).rows[0].released_at,
  );
});
await test("financial ledger is append-only", async () => {
  await assert.rejects(
    db.query("update usage_ledger set amount_micros=1"),
    /append-only/,
  );
  await assert.rejects(db.query("delete from usage_ledger"), /append-only/);
});
await test("only admins may change budgets", async () => {
  await assert.rejects(
    db.query("select set_budget($1,null,999999999,true)", [creator]),
    /Admin required/,
  );
});
await test("staff cannot call privileged financial RPCs", async () => {
  await db.exec("set role authenticated");
  await assert.rejects(
    db.query("select set_budget($1,null,10,true)", [actor]),
    /permission denied/,
  );
  await db.exec("reset role");
});
await test("RLS hides inaccessible projects and jobs", async () => {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
    outsider,
  ]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from projects")).rows.length, 0);
  assert.equal((await db.query("select * from generations")).rows.length, 0);
  await db.exec("reset role");
});
await test("RLS permits project owner and aggregate report", async () => {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
    creator,
  ]);
  await db.exec("set role authenticated");
  assert.equal((await db.query("select * from projects")).rows.length, 1);
  assert.equal(
    (await db.query("select studio_report() as report")).rows[0].report.counts
      .total,
    1,
  );
  await db.exec("reset role");
});
await test("unverified models cannot reserve budget", async () => {
  await db.query(
    `update model_registry set verification_status='sdk-documented' where id=$1`,
    [model.id],
  );
  await assert.rejects(
    reserve("88888888-8888-4888-8888-888888888888", 100000),
    /not verified/,
  );
});
await test("terminal jobs cannot return to a chargeable submission", async () => {
  await assert.rejects(
    db.query(`update generations set status='submitting' where id=$1`, [job]),
    /Invalid generation state transition/,
  );
});
await test("prompt requests have an atomic per-user rate limit", async () => {
  for (let i = 0; i < 5; i++)
    await db.query(`select claim_prompt_request($1,'image')`, [creator]);
  await assert.rejects(
    db.query(`select claim_prompt_request($1,'image')`, [creator]),
    /limit reached/,
  );
});
await test("client budget adds an independent hard limit", async () => {
  await db.query(
    `update model_registry set verification_status='verified' where id=$1`,
    [model.id],
  );
  await db.query(`select set_budget($1,$2,500000,true)`, [actor, client.id]);
  await assert.rejects(
    reserve("99999999-9999-4999-8999-999999999991", 600000),
    /budget hard limit/,
  );
});
await test("admin override permits a client overrun within the global budget", async () => {
  await db.query(`select set_budget($1,$2,500000,false)`, [actor, client.id]);
  const g = await reserve("99999999-9999-4999-8999-999999999992", 600000);
  await db.query(`update generations set status='failed' where id=$1`, [g]);
  await db.query(
    `select reconcile_cost($1,0,'Test fixture rejected before acceptance',$2)`,
    [g, actor],
  );
});
await test("ambiguous submissions retain reservations and require admin evidence", async () => {
  const g = await reserve("99999999-9999-4999-8999-999999999993", 100000);
  await db.query(`update generations set status='submitting' where id=$1`, [g]);
  await db.query(
    `update generations set status='submission_unknown' where id=$1`,
    [g],
  );
  assert.equal(
    (
      await db.query(
        `select released_at from budget_reservations where generation_id=$1`,
        [g],
      )
    ).rows[0].released_at,
    null,
  );
  await assert.rejects(
    db.query(`select reconcile_cost($1,0,'Verified no charge',$2)`, [
      g,
      creator,
    ]),
    /Admin required/,
  );
  await db.query(
    `select reconcile_cost($1,0,'Administrator confirmed no provider charge',$2)`,
    [g, actor],
  );
  await db.query(`update generations set status='failed' where id=$1`, [g]);
});
await test("workers lease existing queued jobs without duplicate claims", async () => {
  const g = await reserve("99999999-9999-4999-8999-999999999994", 100000);
  await db.query(`update generations set status='submitting' where id=$1`, [g]);
  await db.query(
    `update generations set status='queued',provider_request_id='TEST_ONLY_PROVIDER_REQUEST' where id=$1`,
    [g],
  );
  assert.equal((await db.query(`select * from claim_jobs(2)`)).rows.length, 1);
  assert.equal((await db.query(`select * from claim_jobs(2)`)).rows.length, 0);
  await db.query(`update generations set status='failed' where id=$1`, [g]);
  await db.query(`select reconcile_cost($1,0,'Test-only failed result',$2)`, [
    g,
    actor,
  ]);
});
await test("studio queue has a database-enforced concurrency bound", async () => {
  const ids = [];
  for (let i = 0; i < 4; i++)
    ids.push(await reserve("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa" + i, 100));
  await assert.rejects(
    reserve("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", 100),
    /concurrency limit/,
  );
  for (const id of ids) {
    await db.query(`update generations set status='failed' where id=$1`, [id]);
    await db.query(`select reconcile_cost($1,0,'Test fixture cleanup',$2)`, [
      id,
      actor,
    ]);
  }
});
await test("creators cannot elevate their own role through direct database access", async () => {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
    creator,
  ]);
  await db.exec("set role authenticated");
  await db.query(`update profiles set role='admin' where id=$1`, [creator]);
  await db.exec("reset role");
  assert.equal(
    (await db.query(`select role from profiles where id=$1`, [creator])).rows[0]
      .role,
    "creator",
  );
});
await test("asset bucket remains private", async () => {
  assert.equal(
    (
      await db.query(
        `select public from storage.buckets where id='studio-assets'`,
      )
    ).rows[0].public,
    false,
  );
});
await test("private financial evidence is hidden while aggregate budgets remain accurate", async () => {
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [
    outsider,
  ]);
  await db.exec("set role authenticated");
  assert.equal((await db.query(`select * from usage_ledger`)).rows.length, 0);
  const report = (await db.query(`select studio_report() report`)).rows[0]
    .report;
  assert.equal(report.counts.total, 0);
  assert.equal(report.budgets.length, 2);
  await db.exec("reset role");
});
process.stdout.write(`${passed} database integration checks passed.\n`);
await db.close();
