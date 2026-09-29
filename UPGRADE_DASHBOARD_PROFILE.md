# Dashboard and profile update

## Preserve your existing work

1. Stop the running server and back up your current project folder.
2. Keep your existing `.env` and `instance/guidance.db`. Do **not** replace these with the archive's database snapshot if you have added records since that snapshot.
3. Copy the updated `app` folder, `requirements.txt`, tests, and documentation into your existing project. Keep other local configuration and uploads.
4. Activate your existing virtual environment and run:

   ```sh
   python -m pip install -r requirements.txt
   python run.py
   ```

5. Open http://127.0.0.1:5000 and hard-refresh the browser if old styles remain.

The app creates a new `account_settings` table on startup. No existing user, profile, case, appointment, or questionnaire columns are changed. Existing passwords continue working. Profile photos are stored in this new table; include it in future database backups. Do not change existing encryption keys: older counseling notes depend on them. Do not rerun seed scripts to apply this update.

## Changes

- Purple-and-white dashboard with richer account identity card and working profile link.
- Four resource dialogs: session preparation checklist, privacy guide, support pathways, and live account-readiness checks. The checklist intentionally resets when closed; it stores no counseling information.
- Intake, Active, Follow Up, and Closed each open an explanation. These buttons never change a case's status.
- Dedicated `/profile` page for students, counselors, head counselors, administrators, and staff.
- Display name and short bio; editable institutional profile fields when a profile record exists.
- Validated PNG/JPEG photo upload/removal, up to 2 MB and 16 megapixels. Photos are center-cropped, resized, and re-encoded without original metadata.
- Password change requires the current password. All existing access and refresh tokens become invalid after a successful change.
- Shared header with role-aware page search, Home, Help, profile identity, and mobile sidebar toggle.
- Anonymous peer referral remains available without signing in. Existing role permissions still apply on the server.

Display name, bio, and photo are personal workspace settings, not a public directory. Avoid putting confidential case information in them.

## Verification

Run automated tests against an isolated in-memory database (never your real database):

```sh
python -m pip install pytest
python -m pytest -q
```

Tests cover existing case transitions and encrypted notes, appointment conflicts and PDFs, anonymous referrals, clearance, and the new profile/photo/password APIs. JavaScript files were syntax-checked with Node. Live visual browser testing could not be completed because the remote preview browser could not reach the local server.

### Local browser checklist

1. Sign in as each available role. Confirm the sidebar shows only that role's pages.
2. Open all four dashboard resource cards. Toggle preparation checks, expand support topics, and close dialogs with the close button and Escape.
3. Open each lifecycle stage and confirm explanations without changing records.
4. Open My Profile from the sidebar and header on every page. Save preferences and personal details, reload, and check persistence.
5. Upload a small PNG/JPEG; verify the image on the profile page, dashboard, and header. Remove it. Invalid formats and oversized images should be rejected.
6. On a disposable test account, try incorrect current password, mismatching confirmation, and weak passwords. Change it successfully; old sessions should stop working and the new password should sign in.
7. Search for a page in the header and open a result. Check Help and Home.
8. Resize to a phone-width window; test the sidebar toggle, dialogs, and profile forms.
9. Sign out and confirm the anonymous referral page still works. Recheck your usual case, appointment, questionnaire, and clearance actions.

For production, use HTTPS, strong existing application secrets, appropriate database backups, and a production WSGI server. The Flask development server is for local testing.
