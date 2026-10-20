create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 3 and 18),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 24),
  invite_code text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_id_idx on public.group_members(user_id);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'expert')),
  elapsed_seconds integer not null check (elapsed_seconds between 1 and 86400),
  created_at timestamptz not null default now()
);
create index if not exists scores_leaderboard_idx on public.scores(difficulty, elapsed_seconds, created_at);
create index if not exists scores_user_id_idx on public.scores(user_id);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  nickname text := new.raw_user_meta_data ->> 'username';
begin
  if nickname is null or char_length(nickname) < 3 or char_length(nickname) > 18 then
    raise exception 'Invalid nickname';
  end if;
  insert into public.profiles(id, username) values (new.id, nickname);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

create or replace function public.create_game_group(group_name text)
returns public.groups language plpgsql security definer set search_path = public, extensions
as $$
declare
  new_group public.groups;
  code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(group_name)) < 2 or char_length(trim(group_name)) > 24 then raise exception 'Invalid group name'; end if;
  loop
    code := upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 10));
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  insert into public.groups(name, invite_code, owner_id)
    values (trim(group_name), code, auth.uid()) returning * into new_group;
  insert into public.group_members(group_id, user_id) values (new_group.id, auth.uid());
  return new_group;
end;
$$;

create or replace function public.join_game_group(invite text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  target_group uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into target_group from public.groups where invite_code = upper(trim(invite));
  if target_group is null then raise exception 'Invalid invite'; end if;
  insert into public.group_members(group_id, user_id) values (target_group, auth.uid());
  return target_group;
end;
$$;

create or replace function public.is_game_group_member(target_group uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group and gm.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.scores enable row level security;

drop policy if exists "Public can read nicknames" on public.profiles;
create policy "Public can read nicknames" on public.profiles for select using (true);
drop policy if exists "Users can update their nickname" on public.profiles;
create policy "Users can update their nickname" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Members can read their groups" on public.groups;
create policy "Members can read their groups" on public.groups for select to authenticated
  using (public.is_game_group_member(id));
drop policy if exists "Members can read group memberships" on public.group_members;
create policy "Members can read group memberships" on public.group_members for select to authenticated
  using (public.is_game_group_member(group_id));

drop policy if exists "Global leaderboard is public" on public.scores;
create policy "Global leaderboard is public" on public.scores for select using (true);
drop policy if exists "Users can submit their own scores" on public.scores;
create policy "Users can submit their own scores" on public.scores for insert to authenticated
  with check (user_id = auth.uid() and difficulty in ('beginner', 'intermediate', 'expert') and elapsed_seconds between 1 and 86400);

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.scores to anon, authenticated;
grant update(username) on public.profiles to authenticated;
grant select on public.groups, public.group_members to authenticated;
grant insert on public.scores to authenticated;
grant execute on function public.create_game_group(text) to authenticated;
grant execute on function public.join_game_group(text) to authenticated;
grant execute on function public.is_game_group_member(uuid) to authenticated;
