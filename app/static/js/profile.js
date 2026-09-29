(() => {
    const message = (text, error = false) => { const box = document.getElementById('profileMessage'); box.textContent = text; box.dataset.error = String(error); box.scrollIntoView({block:'nearest', behavior:'smooth'}); };
    document.addEventListener('guidance:error', () => { document.getElementById('profileLoading').hidden = true; message('Unable to load your profile. Reload the page or sign in again.', true); });
    document.addEventListener('guidance:ready', () => {
        document.getElementById('profileLoading').hidden = true;
        document.getElementById('profileContent').hidden = false;
        const {me, settings} = Guidance;
        const esc = Guidance.escape;
        const renderIdentity = () => { const name = Guidance.name(Guidance.me, Guidance.settings); document.getElementById('profileHeroName').textContent = name; document.getElementById('profileHeroRole').textContent = Guidance.role(me.user.role); Guidance.avatar(document.getElementById('profileHeroAvatar'), name, Guidance.settings.avatar_url); document.getElementById('removePhoto').disabled = !Guidance.settings.avatar_url; document.dispatchEvent(new CustomEvent('guidance:profile-updated')); };
        renderIdentity();
        const preferences = document.getElementById('preferencesForm');
        preferences.elements.display_name.value = settings.display_name;
        preferences.elements.bio.value = settings.bio;
        document.getElementById('accountEmail').value = me.user.email;
        document.getElementById('accountRole').value = Guidance.role(me.user.role);
        const profile = me.profile;
        const fields = profile ? [['first_name','First name'],['last_name','Last name'],...(me.user.role === 'student' ? [['program','Program'],['year_level','Year level'],['contact_number','Contact number']] : ['counselor','head_counselor'].includes(me.user.role) ? [['specialization','Specialization']] : [])] : [];
        const details = document.getElementById('detailsForm');
        details.innerHTML = fields.map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(profile[key] ?? '')}" ${key === 'year_level' ? 'type="number" min="1" max="8" step="1"' : `maxlength="${key === 'contact_number' ? 30 : ['program','specialization'].includes(key) ? 150 : 100}"`} ${['contact_number','specialization'].includes(key) ? '' : 'required'}></label>`).join('') + (fields.length ? '<button type="submit" class="profile-submit">Save personal information</button>' : '');
        document.getElementById('detailsNote').textContent = profile ? `Institutional ID: ${profile.student_number || profile.employee_number || 'Not assigned'}. Contact your administrator to correct this identifier.` : 'Your account has no institutional profile record. You can still customize your display name, bio, photo, and password. Contact your administrator about official personnel details.';
        async function perform(form, action, success) {
            const buttons = [...form.querySelectorAll('button')]; buttons.forEach(button => button.disabled = true);
            try { await action(); message(success); }
            catch (error) { message(error.data?.message || error.message || 'The change could not be saved. Please try again.', true); }
            finally { buttons.forEach(button => button.disabled = false); renderIdentity(); }
        }
        preferences.onsubmit = event => { event.preventDefault(); perform(preferences, async () => { const result = await apiRequest('/account-settings', {method:'PATCH', body:JSON.stringify(Object.fromEntries(new FormData(preferences)))}); Guidance.settings = result.settings; }, 'Your preferences have been saved.'); };
        details.onsubmit = event => { event.preventDefault(); perform(details, async () => { const data = Object.fromEntries(new FormData(details)); if ('year_level' in data) data.year_level = Number(data.year_level); const result = await apiRequest('/profile', {method:'PATCH', body:JSON.stringify(data)}); Guidance.me.profile = result.profile; saveSession({profile:result.profile}); }, 'Your personal information has been saved.'); };
        const photo = document.getElementById('photoForm');
        photo.onsubmit = event => { event.preventDefault(); perform(photo, async () => { const file = photo.elements.photo.files[0]; if (!file || file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG or JPEG photo no larger than 2 MB.'); const result = await apiRequest('/account-settings/photo', {method:'PUT', body:new FormData(photo)}); Guidance.settings = result.settings; photo.reset(); }, 'Your profile photo has been updated.'); };
        document.getElementById('removePhoto').onclick = () => perform(photo, async () => { Guidance.settings = (await apiRequest('/account-settings/photo', {method:'DELETE'})).settings; photo.reset(); }, 'Your profile photo has been removed.');
        const password = document.getElementById('passwordForm');
        password.onsubmit = event => { event.preventDefault(); if (password.elements.new_password.value !== password.elements.confirmation.value) { message('The new passwords do not match.', true); return; } perform(password, async () => { await apiRequest('/account-settings/password', {method:'POST', body:JSON.stringify({current_password:password.elements.current_password.value, new_password:password.elements.new_password.value})}); password.reset(); clearSession(); location.href = '/?password_changed=1'; }, 'Password changed. Please sign in again.'); };
    });
})();
