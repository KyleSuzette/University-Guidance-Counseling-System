document.addEventListener(
    "DOMContentLoaded",
    async () => {

        // =================================================
        // REQUIRE LOGIN
        // =================================================

        if (!requireLogin()) {
            return;
        }


        // =================================================
        // DOM ELEMENTS
        // =================================================

        const statsGrid =
            document.getElementById(
                "statsGrid"
            );

        const quickActions =
            document.getElementById(
                "quickActions"
            );

        const accountInformation =
            document.getElementById(
                "accountInformation"
            );

        const logoutButton =
            document.getElementById(
                "logoutButton"
            );


        // =================================================
        // CURRENT ACCOUNT
        // =================================================

        let currentUser = null;
        let currentProfile = null;


        // =================================================
        // LOAD CURRENT USER
        // =================================================

        try {

            const data =
                await apiRequest(
                    "/auth/me"
                );

            const user =
                data.user;

            const profile =
                data.profile || null;


            currentUser =
                user;

            currentProfile =
                profile;


            // ---------------------------------------------
            // UPDATE STORED USER
            // ---------------------------------------------

            localStorage.setItem(
                "user",
                JSON.stringify(user)
            );


            if (profile) {

                localStorage.setItem(
                    "profile",
                    JSON.stringify(profile)
                );

            } else {

                localStorage.removeItem(
                    "profile"
                );

            }


            // ---------------------------------------------
            // SETUP PAGE
            // ---------------------------------------------

            setupHeader(
                user,
                profile
            );


            // Shared navigation from navigation.js

            setupRoleNavigation(
                user.role
            );


            renderDashboard(
                user,
                profile
            );


        } catch (error) {

            console.error(
                "Dashboard loading failed:",
                error
            );


            showDashboardError(
                error?.data?.message ||
                "Unable to load your dashboard."
            );

        }



        // =================================================
        // LOGOUT
        // =================================================

        if (logoutButton) {

            logoutButton.addEventListener(
                "click",
                async () => {

                    try {

                        await apiRequest(
                            "/auth/logout",
                            {
                                method: "POST"
                            }
                        );

                    } catch (error) {

                        console.error(
                            "Logout request failed:",
                            error
                        );

                    }


                    clearSession();


                    window.location.href =
                        "/";

                }
            );

        }



        // =================================================
        // HEADER
        // =================================================

        function setupHeader(
            user,
            profile
        ) {

            let displayName =
                user.email;


            if (
                profile &&
                profile.full_name
            ) {

                displayName =
                    profile.full_name;

            } else if (
                profile &&
                (
                    profile.first_name ||
                    profile.last_name
                )
            ) {

                displayName =
                    `${profile.first_name || ""} ${profile.last_name || ""}`
                        .trim();

            }


            // ---------------------------------------------
            // HEADER NAME
            // ---------------------------------------------

            const headerUserName =
                document.getElementById(
                    "headerUserName"
                );


            if (headerUserName) {

                headerUserName.textContent =
                    displayName;

            }


            // ---------------------------------------------
            // HEADER ROLE
            // ---------------------------------------------

            const headerUserRole =
                document.getElementById(
                    "headerUserRole"
                );


            if (headerUserRole) {

                headerUserRole.textContent =
                    formatRole(
                        user.role
                    );

            }


            // ---------------------------------------------
            // WELCOME TEXT
            // ---------------------------------------------

            const welcomeText =
                document.getElementById(
                    "welcomeText"
                );


            if (welcomeText) {

                welcomeText.textContent =
                    `Welcome back, ${displayName}.`;

            }


            // ---------------------------------------------
            // AVATAR
            // ---------------------------------------------

            const firstLetter =
                displayName
                    .charAt(0)
                    .toUpperCase();


            const userAvatar =
                document.getElementById(
                    "userAvatar"
                );


            if (userAvatar) {

                userAvatar.textContent =
                    firstLetter;

            }

        }



        // =================================================
        // DASHBOARD PER ROLE
        // =================================================

        function renderDashboard(
            user,
            profile
        ) {

            switch (
                user.role
            ) {

                case "student":

                    renderStudentDashboard();

                    break;

                case "counselor":

                    renderCounselorDashboard();

                    break;


                case "head_counselor":

                    renderHeadCounselorDashboard();

                    break;


                case "admin":

                    renderAdminDashboard();

                    break;


                case "staff":

                    renderStaffDashboard();

                    break;


                default:

                    if (statsGrid) {

                        statsGrid.innerHTML =
                            "<p>Unknown account role.</p>";

                    }

            }


            renderAccountInfo(
                user,
                profile
            );

        }



        // =================================================
        // STUDENT DASHBOARD
        // =================================================

        function renderStudentDashboard() {

            if (!statsGrid || !quickActions) {
                return;
            }


            statsGrid.innerHTML = `

                ${createStatCard(
                    "Appointments",
                    "View",
                    "View your counseling schedule."
                )}

                ${createStatCard(
                    "Counseling Case",
                    "Status",
                    "Monitor your current case status."
                )}

                ${createStatCard(
                    "Exit Questionnaire",
                    "Form",
                    "Complete your graduation exit assessment."
                )}

                ${createStatCard(
                    "Clearance",
                    "Status",
                    "Check your exit clearance."
                )}

            `;


            quickActions.innerHTML = `

                ${createActionButton(
                    "Request Appointment",
                    "Schedule a guidance counseling session."
                )}

                ${createActionButton(
                    "Anonymous Peer Referral",
                    "Submit a concern about another student."
                )}

                ${createActionButton(
                    "Complete Exit Questionnaire",
                    "Answer the required exit assessment."
                )}

                ${createActionButton(
                    "Check Clearance",
                    "View your clearance requirements."
                )}

            `;

        }

        // =================================================
        // COUNSELOR DASHBOARD
        // =================================================

        async function renderCounselorDashboard() {

            if (!statsGrid || !quickActions) {
                return;
            }


            // Show loading state first
            statsGrid.innerHTML = `

                ${createStatCard(
                    "Assigned Cases",
                    "...",
                    "Counseling cases assigned to you."
                )}

                ${createStatCard(
                    "Active Cases",
                    "...",
                    "Cases currently under counseling."
                )}

                ${createStatCard(
                    "Follow Up",
                    "...",
                    "Cases requiring follow-up."
                )}

                ${createStatCard(
                    "Appointments",
                    "...",
                    "Your counseling appointments."
                )}

            `;


            // Keep existing counselor quick actions
            quickActions.innerHTML = `

                ${createActionButton(
                    "View Assigned Cases",
                    "Open your assigned counseling cases."
                )}

                ${createActionButton(
                    "View Referrals",
                    "Review referrals assigned to you."
                )}

                ${createActionButton(
                    "Appointments",
                    "Check your counseling schedule."
                )}

                ${createActionButton(
                    "Progress Notes",
                    "Record confidential case progress."
                )}

            `;


            try {

                // =============================================
                // LOAD COUNSELOR CASES + APPOINTMENTS
                // =============================================

                const [
                    caseData,
                    appointmentData
                ] = await Promise.all([

                    apiRequest(
                        "/cases"
                    ),

                    apiRequest(
                        "/appointments"
                    )

                ]);


                // =============================================
                // NORMALIZE API RESULTS
                // =============================================

                const cases =
                    Array.isArray(caseData)
                        ? caseData
                        : (
                            caseData.items ||
                            caseData.cases ||
                            []
                        );


                const appointments =
                    Array.isArray(appointmentData)
                        ? appointmentData
                        : (
                            appointmentData.items ||
                            appointmentData.appointments ||
                            []
                        );


                // =============================================
                // CALCULATE CASE COUNTS
                // =============================================

                const assignedCases =
                    cases.length;


                const activeCases =
                    cases.filter(
                        counselingCase =>
                            String(
                                counselingCase.status || ""
                            ).toUpperCase() ===
                            "ACTIVE"
                    ).length;


                const followUpCases =
                    cases.filter(
                        counselingCase =>
                            String(
                                counselingCase.status || ""
                            ).toUpperCase() ===
                            "FOLLOW_UP"
                    ).length;


                // =============================================
                // APPOINTMENT COUNT
                // =============================================

                const appointmentCount =
                    appointments.filter(
                        appointment => {

                            const status =
                                String(
                                    appointment.status || ""
                                ).toUpperCase();

                            return (
                                status === "REQUESTED" ||
                                status === "CONFIRMED"
                            );

                        }
                    ).length;


                // =============================================
                // UPDATE DASHBOARD CARDS
                // =============================================

                statsGrid.innerHTML = `

                    ${createStatCard(
                        "Assigned Cases",
                        assignedCases,
                        "Counseling cases assigned to you."
                    )}

                    ${createStatCard(
                        "Active Cases",
                        activeCases,
                        "Cases currently under counseling."
                    )}

                    ${createStatCard(
                        "Follow Up",
                        followUpCases,
                        "Cases requiring follow-up."
                    )}

                    ${createStatCard(
                        "Appointments",
                        appointmentCount,
                        "Your counseling appointments."
                    )}

                `;


            } catch (error) {

                console.error(
                    "Unable to load counselor dashboard statistics:",
                    error
                );


                statsGrid.innerHTML = `

                    ${createStatCard(
                        "Assigned Cases",
                        "—",
                        "Unable to load case statistics."
                    )}

                    ${createStatCard(
                        "Active Cases",
                        "—",
                        "Unable to load case statistics."
                    )}

                    ${createStatCard(
                        "Follow Up",
                        "—",
                        "Unable to load case statistics."
                    )}

                    ${createStatCard(
                        "Appointments",
                        "—",
                        "Unable to load appointment statistics."
                    )}

                `;

            }

        }



        // =================================================
        // HEAD COUNSELOR DASHBOARD
        // =================================================

        function renderHeadCounselorDashboard() {

            if (!statsGrid || !quickActions) {
                return;
            }


            statsGrid.innerHTML = `

                ${createStatCard(
                    "Referral Queue",
                    "Triage",
                    "Review incoming anonymous referrals."
                )}

                ${createStatCard(
                    "Active Cases",
                    "Cases",
                    "Monitor current counseling cases."
                )}

                ${createStatCard(
                    "Counselors",
                    "Team",
                    "Manage counselor assignments."
                )}

                ${createStatCard(
                    "Clearances",
                    "Review",
                    "Evaluate exit clearance requests."
                )}

            `;


            quickActions.innerHTML = `

                ${createActionButton(
                    "Triage Referrals",
                    "Set priority and review incoming concerns."
                )}

                ${createActionButton(
                    "Assign Counselor",
                    "Assign referrals to counselors."
                )}

                ${createActionButton(
                    "Create Counseling Case",
                    "Open a case from an assigned referral."
                )}

                ${createActionButton(
                    "Evaluate Clearance",
                    "Review graduation clearance requirements."
                )}

            `;

        }



        // =================================================
        // ADMIN DASHBOARD
        // =================================================

        function renderAdminDashboard() {

            if (!statsGrid || !quickActions) {
                return;
            }


            statsGrid.innerHTML = `

                ${createStatCard(
                    "Accounts",
                    "Manage",
                    "Manage university guidance accounts."
                )}

                ${createStatCard(
                    "Cases",
                    "Monitor",
                    "Monitor counseling cases."
                )}

                ${createStatCard(
                    "Rooms",
                    "Manage",
                    "Manage counseling rooms."
                )}

                ${createStatCard(
                    "Audit Logs",
                    "Security",
                    "Review system activity."
                )}

            `;


            quickActions.innerHTML = `

                ${createActionButton(
                    "Create Staff Account",
                    "Create counselor, staff, or administrator accounts."
                )}

                ${createActionButton(
                    "Manage Rooms",
                    "Create and manage counseling rooms."
                )}

                ${createActionButton(
                    "View Audit Logs",
                    "Review recorded system activity."
                )}

                ${createActionButton(
                    "Manage Exit Questionnaire",
                    "Configure the active exit questionnaire."
                )}

            `;

        }
        
        // =================================================
        // STAFF DASHBOARD
        // =================================================

        function renderStaffDashboard() {

            if (!statsGrid || !quickActions) {
                return;
            }


            // ---------------------------------------------
            // HIDE COUNSELING CASE WORKFLOW
            // ---------------------------------------------

            const caseWorkflowPanel =
                document.getElementById(
                    "caseWorkflowPanel"
                );


            if (caseWorkflowPanel) {

                caseWorkflowPanel.style.display =
                    "none";
            }


            // ---------------------------------------------
            // STAFF DASHBOARD CARDS
            // ---------------------------------------------

            statsGrid.innerHTML = `

                ${createStatCard(
                    "Exit Questionnaire",
                    "Manage",
                    "Review student exit questionnaire requirements."
                )}

                ${createStatCard(
                    "Clearance",
                    "Review",
                    "Review and process student clearance records."
                )}

            `;


            // ---------------------------------------------
            // STAFF QUICK ACTIONS
            // ---------------------------------------------

            quickActions.innerHTML = `

                ${createActionButton(
                    "Manage Exit Questionnaire",
                    "Review student exit questionnaire requirements."
                )}

                ${createActionButton(
                    "Evaluate Clearance",
                    "Review student clearance requirements."
                )}

            `;

        }



        // =================================================
        // ACCOUNT INFORMATION
        // =================================================

        function renderAccountInfo(
            user,
            profile
        ) {

            if (!accountInformation) {
                return;
            }


            let html = `

                <div class="info-row">

                    <span>
                        Email
                    </span>

                    <strong>
                        ${escapeHtml(
                            user.email
                        )}
                    </strong>

                </div>


                <div class="info-row">

                    <span>
                        Role
                    </span>

                    <strong>
                        ${escapeHtml(
                            formatRole(
                                user.role
                            )
                        )}
                    </strong>

                </div>


                <div class="info-row">

                    <span>
                        Account
                    </span>

                    <strong>
                        ${
                            user.is_active
                                ? "Active"
                                : "Inactive"
                        }
                    </strong>

                </div>

            `;


            if (profile) {


                // =========================================
                // STUDENT PROFILE
                // =========================================

                if (
                    profile.student_number
                ) {

                    html += `

                        <div class="info-row">

                            <span>
                                Student Number
                            </span>

                            <strong>
                                ${escapeHtml(
                                    profile.student_number
                                )}
                            </strong>

                        </div>


                        <div class="info-row">

                            <span>
                                Program
                            </span>

                            <strong>
                                ${escapeHtml(
                                    profile.program ||
                                    "—"
                                )}
                            </strong>

                        </div>


                        <div class="info-row">

                            <span>
                                Year Level
                            </span>

                            <strong>
                                ${escapeHtml(
                                    profile.year_level ||
                                    "—"
                                )}
                            </strong>

                        </div>

                    `;

                }


                // =========================================
                // COUNSELOR / STAFF PROFILE
                // =========================================

                if (
                    profile.employee_number
                ) {

                    html += `

                        <div class="info-row">

                            <span>
                                Employee Number
                            </span>

                            <strong>
                                ${escapeHtml(
                                    profile.employee_number
                                )}
                            </strong>

                        </div>

                    `;


                    // Specialization is only for counselors.

                    if (
                        user.role === "counselor" ||
                        user.role === "head_counselor"
                    ) {

                        html += `

                            <div class="info-row">

                                <span>
                                    Specialization
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        profile.specialization ||
                                        "—"
                                    )}
                                </strong>

                            </div>

                        `;
                    }

                }
            }


            accountInformation.innerHTML =
                html;

        }



        // =================================================
        // COMPONENT HELPERS
        // =================================================

        function createStatCard(
            title,
            value,
            description
        ) {

            return `

                <div class="stat-card">

                    <span class="stat-label">
                        ${escapeHtml(title)}
                    </span>

                    <strong class="stat-value">
                        ${escapeHtml(value)}
                    </strong>

                    <p>
                        ${escapeHtml(description)}
                    </p>

                </div>

            `;

        }



        function createActionButton(
            title,
            description
        ) {

            return `

                <button
                    type="button"
                    class="action-card"
                >

                    <strong>
                        ${escapeHtml(title)}
                    </strong>

                    <span>
                        ${escapeHtml(description)}
                    </span>

                </button>

            `;

        }



        // =================================================
        // FORMAT ROLE
        // =================================================

        function formatRole(
            role
        ) {

            if (!role) {
                return "";
            }


            return String(role)
                .replaceAll(
                    "_",
                    " "
                )
                .replace(
                    /\b\w/g,
                    letter =>
                        letter.toUpperCase()
                );

        }



        // =================================================
        // ESCAPE HTML
        // =================================================

        function escapeHtml(
            value
        ) {

            if (
                value === null ||
                value === undefined
            ) {

                return "";

            }


            return String(value).replace(
                /[&<>"']/g,
                character => ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                }[character])
            );

        }



        // =================================================
        // ERROR MESSAGE
        // =================================================

        function showDashboardError(
            message
        ) {

            const box =
                document.getElementById(
                    "dashboardMessage"
                );


            if (!box) {
                return;
            }


            box.textContent =
                message;


            box.className =
                "message error";

        }



        // =================================================
        // REFERRALS NAVIGATION
        // =================================================

        const referralsNav =
            document.getElementById(
                "referralsNav"
            );


        if (referralsNav) {

            referralsNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/referrals";

                }
            );

        }



        // =================================================
        // CASES NAVIGATION
        // =================================================

        const casesNav =
            document.getElementById(
                "casesNav"
            );


        if (casesNav) {

            casesNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/cases";

                }
            );

        }



        // =================================================
        // EXIT QUESTIONNAIRE NAVIGATION
        // =================================================

        const exitNav =
            document.getElementById(
                "exitNav"
            );


        if (exitNav) {

            exitNav.addEventListener(
                "click",
                () => {

                    if (
                        currentUser?.role ===
                            "admin" ||
                        currentUser?.role ===
                            "head_counselor" ||
                        currentUser?.role ===
                            "staff"
                    ) {

                        window.location.href =
                            "/manage-exit-questionnaire";

                    } else {

                        window.location.href =
                            "/exit-questionnaire";

                    }

                }
            );

        }



        // =================================================
        // CLEARANCE NAVIGATION
        // =================================================

        const clearanceNav =
            document.getElementById(
                "clearanceNav"
            );


        if (clearanceNav) {

            clearanceNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/clearance";

                }
            );

        }



        // =================================================
        // ADMINISTRATION NAVIGATION
        // =================================================

        const adminNav =
            document.getElementById(
                "adminNav"
            );


        if (adminNav) {

            adminNav.addEventListener(
                "click",
                () => {

                    if (
                        currentUser?.role ===
                        "admin"
                    ) {

                        window.location.href =
                            "/admin-management";

                    }

                }
            );

        }



        // =================================================
        // PROFILE BUTTON
        // =================================================

        const profileButton =
            document.getElementById(
                "profileButton"
            );


        if (profileButton) {

            profileButton.addEventListener(
                "click",
                () => {

                    const accountPanel =
                        accountInformation
                            ?.closest(
                                ".panel"
                            );


                    if (accountPanel) {

                        accountPanel.scrollIntoView({
                            behavior: "smooth",
                            block: "center"
                        });

                    }

                }
            );

        }



        // =================================================
        // QUICK ACTION BUTTONS
        // =================================================

        if (quickActions) {

            quickActions.addEventListener(
                "click",
                event => {

                    const button =
                        event.target.closest(
                            ".action-card"
                        );


                    if (!button) {
                        return;
                    }


                    const actionTitle =
                        button
                            .querySelector(
                                "strong"
                            )
                            ?.textContent
                            .trim();


                    switch (
                        actionTitle
                    ) {


                        // =====================================
                        // APPOINTMENTS
                        // =====================================

                        case "Request Appointment":

                        case "Appointments":

                        case "View Appointments":

                            window.location.href =
                                "/appointments";

                            break;



                        // =====================================
                        // REFERRALS
                        // =====================================

                        case "Anonymous Peer Referral":

                        case "View Referrals":

                        case "Triage Referrals":

                        case "Assign Counselor":

                            window.location.href =
                                "/referrals";

                            break;



                        // =====================================
                        // EXIT QUESTIONNAIRE
                        // =====================================

                        case "Complete Exit Questionnaire":

                            window.location.href =
                                "/exit-questionnaire";

                            break;


                        case "Manage Exit Questionnaire":

                        case "Check Exit Submission":

                            window.location.href =
                                "/manage-exit-questionnaire";

                            break;



                        // =====================================
                        // CLEARANCE
                        // =====================================

                        case "Check Clearance":

                        case "Evaluate Clearance":

                            window.location.href =
                                "/clearance";

                            break;



                        // =====================================
                        // CASES
                        // =====================================

                        case "View Assigned Cases":

                        case "Create Counseling Case":

                        case "Progress Notes":

                            window.location.href =
                                "/cases";

                            break;



                        // =====================================
                        // ADMINISTRATION
                        // =====================================

                        case "Create Staff Account":

                        case "Manage Rooms":

                            if (
                                currentUser?.role ===
                                "admin"
                            ) {

                                window.location.href =
                                    "/admin-management";

                            }

                            break;



                        // =====================================
                        // AUDIT LOGS
                        // =====================================

                        case "View Audit Logs":

                            console.log(
                                "Audit Logs page will be connected next."
                            );

                            break;



                        // =====================================
                        // DEFAULT
                        // =====================================

                        default:

                            console.log(
                                "No page connected yet:",
                                actionTitle
                            );

                    }

                }
            );

        }

    }
);
