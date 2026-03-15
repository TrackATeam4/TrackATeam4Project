# Admin Demo Runbook (Hackathon)

## 1) 5-minute rehearsal flow
1. Sign in as `admin` and open `/admin/home`.
2. Confirm Command Center cards load and click `Refresh` once.
3. Open `/admin/campaigns`.
4. Filter by status/date and open one campaign detail.
5. Confirm signups table renders rows.
6. Cancel one campaign and confirm success notice appears.
7. Open `/admin/pantries`.
8. Verify one pantry and confirm count/notice updates.
9. Open `/admin/flyers`.
10. Create or edit one template and confirm success notice.
11. Return to `/admin/home` and call out Trends + Impact hotspots.

## 2) Non-admin access check
1. Sign out.
2. Sign in with a non-admin account.
3. Attempt `/admin/home`.
4. Expected: redirected/denied (no admin dashboard access).

## 3) Stage-safe fallback script
- If data is sparse: point to action-oriented empty states and explain they are operational guardrails.
- If one API call fails: continue with Campaigns -> Pantries -> Flyers mutation flow.
- If map appears sparse: use Top 3 Hotspots panel and KPI strip as backup narrative.

## 4) Post-demo key hygiene checklist
1. Rotate credentials in provider dashboards:
   - Supabase keys used in local env
   - Resend API key
   - Bluesky app password
2. Update local files only:
   - `backend/.env`
   - `frontend/.env.local`
3. Restart backend/frontend after key update.
4. Ensure no secrets are tracked:
   - `git ls-files backend/.env frontend/.env.local` should print nothing.
5. If any key was shared publicly, rotate immediately (do not reuse).

## 5) Quick commands
```powershell
# frontend production check
cd frontend
npm run build

# backend syntax check
cd ..
python -m py_compile backend/main.py backend/routes/map.py
```
