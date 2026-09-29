/* Shared authenticated workspace. Centralizes sidebar navigation across legacy pages. */
window.Guidance = {
    escape(value) { const el = document.createElement('span'); el.textContent = value ?? ''; return el.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;'); },
    role(value) { return (value || '').replaceAll('_', ' '); },
    name(me, settings = {}) { return settings.display_name || me.profile?.full_name || me.user.email.split('@')[0]; },
    avatar(el, name, url) {
        if (!el) return;
        el.replaceChildren();
        if (url) { const img = document.createElement('img'); img.src = url; img.alt = `${name}'s profile photo`; el.append(img); }
        else el.textContent = name.trim().slice(0, 2).toUpperCase();
    },
    dialog(title, html) {
        let dialog = document.getElementById('workspaceDialog');
        if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'workspaceDialog'; dialog.className = 'workspace-dialog'; document.body.append(dialog); }
        dialog.onchange = null;
        dialog.innerHTML = `<div class="dialog-heading"><h2 id="dialogTitle">${this.escape(title)}</h2><button type="button" aria-label="Close dialog" class="icon-button">×</button></div><div class="dialog-content">${html}</div>`;
        dialog.setAttribute('aria-labelledby', 'dialogTitle');
        dialog.querySelector('button').onclick = () => dialog.close();
        dialog.onclick = event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } };
        dialog.showModal();
        return dialog;
    },
    async signOut() {
        try { const refresh = getRefreshToken(); if (refresh) await fetch(`${API_BASE}/auth/logout`, {method:'POST', headers:{Authorization:`Bearer ${refresh}`}}); await apiRequest('/auth/logout', {method:'POST'}); }
        finally { clearSession(); location.href = '/'; }
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    // Anonymous peer referrals must remain accessible without an account.
    if (location.pathname === '/referrals' && !getAccessToken()) return;
    if (!document.querySelector('.sidebar') || !requireLogin()) return;
    const main = document.querySelector('.main-content, .dashboard-main');
    if (!document.getElementById('profileButton')) {
        const button = document.createElement('button'); button.type = 'button'; button.id = 'profileButton'; button.className = 'nav-item'; button.textContent = 'My Profile'; document.querySelector('.sidebar-bottom')?.prepend(button);
    }
    const header = document.createElement('div');
    header.className = 'workspace-header';
    header.innerHTML = `<div class="header-start"><button type="button" class="icon-button menu-toggle" aria-label="Toggle navigation" aria-expanded="false">☰</button><a class="workspace-brand" href="/dashboard">Guidance<span>Your campus support space</span></a></div><form class="workspace-search" role="search"><label class="sr-only" for="workspaceSearch">Find a page</label><input id="workspaceSearch" placeholder="Find a page…" autocomplete="off"><button type="submit" aria-label="Search pages">⌕</button></form><div class="header-tools"><a href="/dashboard" class="header-home" aria-label="Dashboard">Home</a><button type="button" class="header-help">Help</button><a href="/profile" class="header-profile" aria-label="My Profile"><span class="workspace-avatar" id="topbarAvatar">GC</span><span id="topbarName">My Profile</span></a></div>`;
    main?.prepend(header);
    header.querySelector('.menu-toggle').onclick = event => { const open = document.body.classList.toggle('sidebar-open'); event.currentTarget.setAttribute('aria-expanded', String(open)); };
    header.querySelector('.header-help').onclick = () => Guidance.dialog('Your guidance workspace', '<p>Use the sidebar to browse services. Quick Actions open common tasks; dashboard resource cards open practical guidance.</p><p>My Profile lets you update your personal details, photo, and password. Role and sign-in email are managed by your administrator.</p><p>This portal is not monitored as an emergency service. For immediate danger, contact local emergency services or campus security.</p>');
    const routes = {dashboardNav:'/dashboard', appointmentsNav:'/appointments', casesNav:'/cases', referralsNav:'/referrals', clearanceNav:'/clearance', adminNav:'/admin-management', profileButton:'/profile'};
    const routeFor = id => id === 'exitNav' ? (getStoredUser()?.role === 'student' ? '/exit-questionnaire' : '/manage-exit-questionnaire') : routes[id];
    document.querySelector('.sidebar').addEventListener('click', event => {
        const button = event.target.closest('button, a');
        if (!button || button.disabled) return;
        const route = routeFor(button.id);
        if (route || button.id === 'logoutButton') { event.preventDefault(); event.stopImmediatePropagation(); if (route) location.href = route; else Guidance.signOut(); }
    }, true);
    header.querySelector('form').onsubmit = event => {
        event.preventDefault();
        const query = header.querySelector('input').value.trim().toLowerCase();
        const links = [...document.querySelectorAll('.sidebar button, .sidebar a')].filter(button => button.style.display !== 'none' && (routeFor(button.id) || button.getAttribute('href')) && (!query || button.textContent.toLowerCase().includes(query)));
        Guidance.dialog('Find a page', links.length ? `<nav class="search-results">${links.map(button => `<a href="${routeFor(button.id) || button.getAttribute('href')}">${Guidance.escape(button.textContent.trim())}<span>→</span></a>`).join('')}</nav>` : '<p>No matching pages. Try “profile”, “cases”, or “appointments”.</p>');
    };
    try {
        const [me, result] = await Promise.all([apiRequest('/auth/me'), apiRequest('/account-settings')]);
        saveSession(me); setupRoleNavigation(me.user.role);
        Guidance.me = me; Guidance.settings = result.settings;
        const refreshIdentity = () => { const name = Guidance.name(Guidance.me, Guidance.settings); header.querySelector('#topbarName').textContent = name; Guidance.avatar(document.getElementById('topbarAvatar'), name, Guidance.settings.avatar_url); };
        refreshIdentity(); document.addEventListener('guidance:profile-updated', refreshIdentity);
        document.dispatchEvent(new CustomEvent('guidance:ready'));
    } catch (error) { header.querySelector('#topbarName').textContent = 'My Profile'; console.error('Workspace could not load account information', error.status); document.dispatchEvent(new CustomEvent('guidance:error')); }
});
