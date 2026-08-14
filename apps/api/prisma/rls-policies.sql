-- Snaply RLS 정책
-- Supabase SQL Editor에서 마이그레이션 적용 후 직접 실행하세요.
--
-- 원칙:
--   * 모든 테이블 RLS 활성화
--   * 유저는 자신의 데이터만 SELECT / INSERT / UPDATE / DELETE 가능
--   * supabase_uid = auth.uid() 조건으로 본인 확인
--   * API 서버는 service_role 키를 사용하므로 RLS를 우회함 (service_role은 BYPASSRLS)

-- 현재 요청자의 users.id를 반환하는 헬퍼
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where supabase_uid = auth.uid()
$$;

-- ── users ──────────────────────────────────────────────
alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select using (supabase_uid = auth.uid());
create policy "users_insert_own" on public.users
  for insert with check (supabase_uid = auth.uid());
create policy "users_update_own" on public.users
  for update using (supabase_uid = auth.uid());
create policy "users_delete_own" on public.users
  for delete using (supabase_uid = auth.uid());

-- ── locations (공용 읽기 전용) ─────────────────────────
alter table public.locations enable row level security;

create policy "locations_select_all" on public.locations
  for select to authenticated using (is_active = true);
-- INSERT/UPDATE/DELETE 정책 없음 → 일반 유저 쓰기 불가 (관리는 service_role로만)

-- ── notification_logs ──────────────────────────────────
alter table public.notification_logs enable row level security;

create policy "notification_logs_select_own" on public.notification_logs
  for select using (user_id = public.current_app_user_id());
create policy "notification_logs_insert_own" on public.notification_logs
  for insert with check (user_id = public.current_app_user_id());
create policy "notification_logs_delete_own" on public.notification_logs
  for delete using (user_id = public.current_app_user_id());

-- ── videos ─────────────────────────────────────────────
alter table public.videos enable row level security;

create policy "videos_select_own" on public.videos
  for select using (user_id = public.current_app_user_id());
create policy "videos_insert_own" on public.videos
  for insert with check (user_id = public.current_app_user_id());
create policy "videos_update_own" on public.videos
  for update using (user_id = public.current_app_user_id());
create policy "videos_delete_own" on public.videos
  for delete using (user_id = public.current_app_user_id());

-- ── edit_jobs ──────────────────────────────────────────
alter table public.edit_jobs enable row level security;

create policy "edit_jobs_select_own" on public.edit_jobs
  for select using (user_id = public.current_app_user_id());
create policy "edit_jobs_insert_own" on public.edit_jobs
  for insert with check (user_id = public.current_app_user_id());
create policy "edit_jobs_update_own" on public.edit_jobs
  for update using (user_id = public.current_app_user_id());
create policy "edit_jobs_delete_own" on public.edit_jobs
  for delete using (user_id = public.current_app_user_id());

-- ── sns_connections ────────────────────────────────────
alter table public.sns_connections enable row level security;

create policy "sns_connections_select_own" on public.sns_connections
  for select using (user_id = public.current_app_user_id());
create policy "sns_connections_insert_own" on public.sns_connections
  for insert with check (user_id = public.current_app_user_id());
create policy "sns_connections_update_own" on public.sns_connections
  for update using (user_id = public.current_app_user_id());
create policy "sns_connections_delete_own" on public.sns_connections
  for delete using (user_id = public.current_app_user_id());

-- ── sns_uploads ────────────────────────────────────────
alter table public.sns_uploads enable row level security;

create policy "sns_uploads_select_own" on public.sns_uploads
  for select using (user_id = public.current_app_user_id());
create policy "sns_uploads_insert_own" on public.sns_uploads
  for insert with check (user_id = public.current_app_user_id());
create policy "sns_uploads_update_own" on public.sns_uploads
  for update using (user_id = public.current_app_user_id());
create policy "sns_uploads_delete_own" on public.sns_uploads
  for delete using (user_id = public.current_app_user_id());

-- ── purchases ──────────────────────────────────────────
alter table public.purchases enable row level security;

create policy "purchases_select_own" on public.purchases
  for select using (user_id = public.current_app_user_id());
-- 구매 기록의 생성/변경은 RevenueCat 웹훅(service_role)에서만 수행 → 유저 쓰기 정책 없음

-- ── credit_ledger ──────────────────────────────────────
alter table public.credit_ledger enable row level security;

create policy "credit_ledger_select_own" on public.credit_ledger
  for select using (user_id = public.current_app_user_id());
-- 원장은 append-only 이고 잔액의 원천이다. 지급·차감·환급은 전부 서버(service_role)가
-- 수행하므로 유저 쓰기 정책을 두지 않는다 — 클라이언트가 잔액을 만들 수 있으면 안 된다.
