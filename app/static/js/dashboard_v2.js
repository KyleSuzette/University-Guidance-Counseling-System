document.addEventListener('guidance:error', () => {
    const message = document.getElementById('dashboardMessage');
    message.classList.remove('hidden'); message.textContent = 'Your dashboard could not load. Please reload the page or sign in again.';
});
document.addEventListener('guidance:ready', () => {
    const {me, settings} = Guidance;
    const student = me.user.role === 'student';
    const name = Guidance.name(me, settings);
    const esc = Guidance.escape;
    document.getElementById('dashboardTitle').textContent = 'Your guidance dashboard';
    document.getElementById('welcomeText').textContent = `Welcome back, ${name}. Your next step starts here.`;
    document.getElementById('headerUserName').textContent = name;
    document.getElementById('headerUserRole').textContent = Guidance.role(me.user.role);
    Guidance.avatar(document.getElementById('userAvatar'), name, settings.avatar_url);
    const cards = [
        ['✦', student ? 'Session preparation' : 'Session essentials', 'A practical checklist for a focused, supportive conversation.', 'Open checklist', 'prepare'],
        ['◇', 'Privacy & trust', 'Understand privacy, boundaries, and responsible sharing.', 'Read privacy guide', 'privacy'],
        ['↗', 'Find the right support', 'Choose a next step for yourself or someone you care about.', 'Explore support', 'support'],
        ['✓', 'Account readiness', 'Review your details and see what still needs attention.', 'Review your account', 'readiness']
    ];
    document.getElementById('statsGrid').innerHTML = cards.map(([icon,title,description,action,key]) => `<button class="resource-card" type="button" data-resource="${key}" aria-haspopup="dialog"><span class="resource-symbol" aria-hidden="true">${icon}</span><strong>${title}</strong><p>${description}</p><span class="resource-link">${action} →</span></button>`).join('');
    document.getElementById('statsGrid').onclick = event => { const card = event.target.closest('[data-resource]'); if (card) openResource(card.dataset.resource); };
    const actions = {
        student:[['Request Appointment','Arrange a conversation with a counselor.','/appointments'],['Anonymous Peer Referral','Share a concern about a fellow student.','/referrals'],['Exit Questionnaire','Complete your graduation feedback.','/exit-questionnaire'],['Check Clearance','Review your clearance requests.','/clearance']],
        counselor:[['Assigned Cases','Review cases available to your account.','/cases'],['Referrals','Review your referral workspace.','/referrals'],['Appointments','Manage your session schedule.','/appointments']],
        head_counselor:[['Triage Referrals','Review referrals and assign counselors.','/referrals'],['Counseling Cases','Coordinate ongoing case support.','/cases'],['Appointments','Review and manage appointments.','/appointments'],['Evaluate Clearance','Review student clearance requests.','/clearance']],
        admin:[['Administration','Manage staff accounts and counseling rooms.','/admin-management'],['Counseling Cases','Review the case workspace.','/cases'],['Appointments','Manage appointments and schedules.','/appointments'],['Exit Questionnaire','Manage the active questionnaire.','/manage-exit-questionnaire']],
        staff:[['Exit Questionnaire','Review questionnaire information.','/manage-exit-questionnaire'],['Evaluate Clearance','Review student clearance requests.','/clearance']]
    };
    document.getElementById('quickActions').innerHTML = (actions[me.user.role] || []).map(([title,description,url]) => `<a class="action-card" href="${url}"><strong>${title}</strong><span>${description}</span></a>`).join('');
    const profile = me.profile || {};
    const rows = [['Email',me.user.email],['Account',me.user.is_active ? 'Active' : 'Inactive'], ...(student ? [['Student number',profile.student_number],['Program',profile.program],['Year level',profile.year_level]] : [['Employee number',profile.employee_number],['Specialization',profile.specialization]])].filter(([,v]) => v !== undefined && v !== null);
    document.getElementById('accountInformation').innerHTML = `<div class="identity-card"><span class="workspace-avatar large" id="accountAvatar"></span><div><h3>${esc(name)}</h3><p>${esc(Guidance.role(me.user.role))}</p></div></div>${rows.map(([label,value]) => `<div class="info-row"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}<a class="account-edit" href="/profile">Manage my profile →</a>`;
    Guidance.avatar(document.getElementById('accountAvatar'), name, settings.avatar_url);
    const stages = {
        INTAKE:['Getting to know the concern','The counselor gathers initial information, clarifies the reason for support, and considers the appropriate next steps. A case at intake has not yet moved into active counseling.','Be ready to describe your concerns, expectations, and availability.'],
        ACTIVE:['Working together','Counseling is underway. The student and counselor work on agreed goals through scheduled sessions and appropriate support. Progress is reviewed by the responsible counselor.','Attend agreed sessions and discuss what is helping or what needs to change.'],
        'FOLLOW UP':['Checking progress','The case is in a monitoring phase. Follow-up conversations help review progress and determine whether additional support is needed.','Keep agreed check-ins and let your counselor know if concerns return.'],
        CLOSED:['Completing this period of support','The counselor has closed the case. Closure records the end of this case’s current support process; it does not prevent the student from seeking help again.','Contact the guidance office if you need further support. Case closure alone does not guarantee clearance approval.']
    };
    document.querySelectorAll('.lifecycle-step').forEach(old => {
        const stage = old.querySelector('strong').textContent.trim();
        const button = document.createElement('button'); button.type = 'button'; button.className = old.className; button.innerHTML = old.innerHTML; button.setAttribute('aria-haspopup','dialog');
        button.onclick = () => { const [title,description,next] = stages[stage]; Guidance.dialog(`${stage}: ${title}`, `<p>${description}</p><h3>What this means for the student</h3><p>${next}</p><p class="muted">This explains a stage; it does not change a case status. Only authorized staff can update case records.</p>`); };
        old.replaceWith(button);
    });
    function openResource(key) {
        if (key === 'prepare') {
            const tasks = student ? ['Think about what you would like help with.','Write down questions you want to ask.','Check your appointment time and location.','Plan a private space if your session is remote.'] : ['Review the relevant appointment and authorized case information.','Prepare a private, appropriate session space.','Confirm the student’s goals and expectations.','Plan how to record next steps after the conversation.'];
            const dialog = Guidance.dialog(student ? 'Prepare for your session' : 'Session essentials', `<p>Use this checklist before a conversation. It is a personal planning aid, not a clinical assessment.</p>${tasks.map(text => `<label class="check-row"><input type="checkbox"><span>${text}</span></label>`).join('')}<p id="checkProgress" role="status">0 of ${tasks.length} ready</p><p class="muted">Checks reset when you close this window. No counseling information is saved.</p>`);
            dialog.onchange = () => { dialog.querySelector('#checkProgress').textContent = `${dialog.querySelectorAll('input:checked').length} of ${tasks.length} ready`; };
        } else if (key === 'privacy') {
            Guidance.dialog('Privacy & trust', '<p>Share sensitive information through the appropriate counseling process, not in your display name or profile bio.</p><ul><li>Access to case records is controlled by account role and assignment.</li><li>Your counselor can explain confidentiality and its limits before a session.</li><li>Ask the guidance office how records are retained and when information may need to be shared.</li><li>Sign out when using a shared device and never share your password.</li></ul><p class="muted">This overview is not a substitute for your institution’s consent forms or privacy policy.</p>');
        } else if (key === 'support') {
            Guidance.dialog('Find the right support', `<p>Select the situation that fits. This guide does not assess urgency or diagnose a concern.</p><details><summary>I would like someone to talk to</summary><p>${student ? 'Use Request Appointment to arrange counseling support. If you cannot find a suitable slot, contact your guidance office.' : 'Help the student contact the guidance office or use the appointment workflow available to your role.'}</p></details><details><summary>I am concerned about another student</summary><p>${student ? 'Use Anonymous Peer Referral to share the concern. Avoid assumptions and describe what you observed.' : 'Use the referral process and share only the information needed for appropriate support.'}</p></details><details><summary>I need help with graduation requirements</summary><p>Review the exit questionnaire and clearance process with the guidance office. Completing one step does not automatically complete all requirements.</p></details><details><summary>Someone may be in immediate danger</summary><p>Contact local emergency services or campus security immediately. Do not wait for a portal response.</p></details>`);
        } else {
            const checks = [['Account active',me.user.is_active],['Profile name available',Boolean(settings.display_name || profile.full_name)],['Profile photo added (optional)',Boolean(settings.avatar_url)],...(student ? [['Contact number added',Boolean(profile.contact_number)],['Academic information available',Boolean(profile.program && profile.year_level)]] : [])];
            Guidance.dialog('Account readiness', `<p>These checks use your saved account details. They are not counseling or clearance requirements.</p><ul>${checks.map(([label,done]) => `<li>${done ? '✓' : '○'} ${label}${done ? '' : ' — not added'}</li>`).join('')}</ul><a class="account-edit" href="/profile">Update my profile →</a>`);
        }
    }
});
