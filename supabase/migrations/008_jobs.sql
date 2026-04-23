create table if not exists public.background_jobs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    store_id uuid references public.stores not null,
    type text not null, -- 'optimize', 'remove_logo', 'apply_logo', 'publish'
    status text not null default 'pending', -- 'pending', 'processing', 'completed', 'failed'
    progress jsonb default '{}'::jsonb,
    result jsonb default null,
    error text default null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.background_jobs enable row level security;

create policy "Users can view their own jobs"
    on public.background_jobs for select
    using (auth.uid() = user_id);

create policy "Users can insert their own jobs"
    on public.background_jobs for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own jobs"
    on public.background_jobs for update
    using (auth.uid() = user_id);

-- trigger for updated_at
create trigger set_background_jobs_updated_at
    before update on public.background_jobs
    for each row
    execute function public.update_updated_at();
