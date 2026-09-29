document.addEventListener(
    "DOMContentLoaded",
    async () => {

        if (!requireLogin()) {
            return;
        }


        const casesContainer =
            document.getElementById(
                "casesContainer"
            );

        const statusFilter =
            document.getElementById(
                "caseStatusFilter"
            );

        const messageBox =
            document.getElementById(
                "casesMessage"
            );

        // =============================================
        // CURRENT USER
        // =============================================

        let currentRole = null;


        async function loadCurrentUser() {

            const data =
                await apiRequest(
                    "/auth/me"
                );


            currentRole =
                data.user?.role || null;


            setupRoleNavigation(
                currentRole
            );


            configureCasePage();

        }


        // =============================================
        // CONFIGURE CASE PAGE BY ROLE
        // =============================================

        function configureCasePage() {

            const caseListTitle =
                document.getElementById(
                    "caseListTitle"
                );

            const caseListDescription =
                document.getElementById(
                    "caseListDescription"
                );


            if (!caseListTitle || !caseListDescription) {
                return;
            }


            if (currentRole === "student") {

                caseListTitle.textContent =
                    "My Cases";

                caseListDescription.textContent =
                    "Cases associated with your student account.";

            } else if (currentRole === "counselor") {

                caseListTitle.textContent =
                    "Assigned Cases";

                caseListDescription.textContent =
                    "Counseling cases assigned to you.";

            } else if (currentRole === "head_counselor") {

                caseListTitle.textContent =
                    "Counseling Cases";

                caseListDescription.textContent =
                    "Review and manage university counseling cases.";

            } else if (currentRole === "admin") {

                caseListTitle.textContent =
                    "Counseling Cases";

                caseListDescription.textContent =
                    "View and manage counseling case records.";

            } else {

                caseListTitle.textContent =
                    "Cases";

                caseListDescription.textContent =
                    "Counseling case records.";

            }

        }

        // =============================================
        // LOAD CASES
        // =============================================

        async function loadCases() {

            casesContainer.innerHTML =
                "<p>Loading cases...</p>";


            let endpoint =
                "/cases";


            if (
                statusFilter &&
                statusFilter.value
            ) {

                endpoint +=
                    `?status=${encodeURIComponent(
                        statusFilter.value
                    )}`;

            }


            try {

                const data =
                    await apiRequest(
                        endpoint
                    );


                const cases =
                    data.items ||
                    data.cases ||
                    [];


                renderCases(
                    cases
                );


            } catch (error) {

                console.error(
                    "Unable to load cases:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to load counseling cases.",
                    "error"
                );


                casesContainer.innerHTML =
                    "";

            }

        }


        // =============================================
        // RENDER CASES
        // =============================================

        function renderCases(cases) {

            if (!cases.length) {

                casesContainer.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            No counseling cases found
                        </h3>

                        <p>
                            You currently do not have any
                            counseling cases to display.
                        </p>

                    </div>

                `;

                return;

            }


            casesContainer.innerHTML =
                cases.map(caseItem => {

                    return `

                        <article class="case-card">

                            <div class="case-card-header">

                                <div>

                                    <span class="case-number">
                                        ${escapeHtml(
                                            caseItem.case_number
                                        )}
                                    </span>

                                    <h3>
                                        Counseling Case
                                    </h3>

                                </div>


                                <span class="
                                    case-status
                                    status-${String(
                                        caseItem.status
                                    )
                                        .toLowerCase()
                                        .replaceAll(
                                            "_",
                                            "-"
                                        )}
                                ">

                                    ${formatStatus(
                                        caseItem.status
                                    )}

                                </span>

                            </div>


                            <div class="case-info">

                                <p>
                                    <strong>Concern:</strong>
                                    ${escapeHtml(
                                        caseItem.category
                                    )}
                                </p>

                                <p>
                                    <strong>Priority:</strong>
                                    ${formatStatus(
                                        caseItem.priority
                                    )}
                                </p>

                                <p>
                                    <strong>Opened:</strong>
                                    ${formatDate(
                                        caseItem.opened_at
                                    )}
                                </p>

                                <p>
                                    <strong>Current Status:</strong>
                                    ${formatStatus(
                                        caseItem.status
                                    )}
                                </p>

                            </div>


                            ${
                                caseItem.intake_summary
                                    ? `

                                        <div class="case-summary">

                                            <span>
                                                Intake Summary
                                            </span>

                                            <p>
                                                ${escapeHtml(
                                                    caseItem.intake_summary
                                                )}
                                            </p>

                                        </div>

                                    `
                                    : ""
                            }


                            ${renderProgress(
                                caseItem.status
                            )}


                            ${renderProgressNotes(
                                caseItem
                            )}


                            ${renderCaseActions(
                                caseItem
                            )}

                        </article>

                    `;

                }).join("");


            /*
             * The case cards have now been inserted
             * into the DOM, so their buttons can
             * safely receive event listeners.
             */

            bindCaseStatusButtons();
            bindProgressNoteButtons();
            bindCaseSummaryButtons();
        }


        // =============================================
        // CASE PROGRESS
        // =============================================

        function renderProgress(status) {

            const stages = [
                "INTAKE",
                "ACTIVE",
                "FOLLOW_UP",
                "CLOSED"
            ];


            const currentIndex =
                stages.indexOf(status);


            return `

                <div class="case-progress">

                    ${
                        stages.map(
                            (stage, index) => {

                                let state =
                                    "upcoming";

                                let stateLabel =
                                    "Next";

                                let symbol =
                                    index + 1;


                                if (
                                    index <
                                    currentIndex
                                ) {

                                    state =
                                        "completed";

                                    stateLabel =
                                        "Completed";

                                    symbol =
                                        "✓";

                                }


                                if (
                                    index ===
                                    currentIndex
                                ) {

                                    state =
                                        "current";

                                    stateLabel =
                                        stage === "CLOSED"
                                            ? "Closed"
                                            : "Current";

                                    symbol =
                                        stage === "CLOSED"
                                            ? "✓"
                                            : "●";

                                }


                                return `

                                    <div class="progress-stage ${state}">

                                        <span class="progress-circle">
                                            ${symbol}
                                        </span>

                                        <small class="progress-stage-name">
                                            ${formatStatus(
                                                stage
                                            )}
                                        </small>

                                        <small class="progress-stage-state">
                                            ${stateLabel}
                                        </small>

                                    </div>

                                `;

                            }
                        ).join("")
                    }

                </div>

            `;

        }


        // =============================================
        // PROGRESS NOTES
        // =============================================

        function renderProgressNotes(
            caseItem
        ) {

            /*
             * Progress notes become available
             * after the case leaves INTAKE.
             */

            if (
                caseItem.status ===
                "INTAKE"
            ) {

                return `

                    <div class="progress-notes-section">

                        <div class="progress-notes-header">

                            <div>

                                <h4>
                                    Confidential Progress Notes
                                </h4>

                                <p>
                                    Progress notes will become
                                    available once the case enters
                                    Active Counseling.
                                </p>

                            </div>

                        </div>

                    </div>

                `;

            }


            return `

                <div class="progress-notes-section">

                    <div class="progress-notes-header">

                        <div>

                            <h4>
                                Confidential Progress Notes
                            </h4>

                            <p>
                                Authorized counseling records
                                associated with this case.
                            </p>

                        </div>


                        <button
                            type="button"
                            class="btn btn-outline toggle-notes-button"
                            data-case-id="${caseItem.id}"
                        >
                            View Notes
                        </button>

                    </div>


                    <div
                        id="notesPanel-${caseItem.id}"
                        class="progress-notes-panel hidden"
                    >

                        <div
                            id="notesList-${caseItem.id}"
                            class="progress-notes-list"
                        >

                            <p>
                                Select View Notes to load
                                the counseling records.
                            </p>

                        </div>


                        ${
                            caseItem.status !==
                            "CLOSED"

                                ? `

                                    <div class="add-progress-note">

                                        <h5>
                                            Add Progress Note
                                        </h5>


                                        <label
                                            for="progressNote-${caseItem.id}"
                                        >
                                            Counseling Note
                                        </label>


                                        <textarea
                                            id="progressNote-${caseItem.id}"
                                            rows="5"
                                            placeholder="Enter the confidential counseling progress note."
                                        ></textarea>


                                        <div class="progress-note-actions">

                                            <button
                                                type="button"
                                                class="btn btn-primary save-progress-note-button"
                                                data-case-id="${caseItem.id}"
                                            >
                                                Save Progress Note
                                            </button>

                                        </div>

                                    </div>

                                `

                                : `

                                    <div class="closed-note-message">

                                        <p>
                                            This case is closed.
                                            Existing progress notes
                                            remain available for
                                            authorized review.
                                        </p>

                                    </div>

                                `
                        }

                    </div>

                </div>

            `;

        }


        // =============================================
        // BIND PROGRESS NOTE BUTTONS
        // =============================================

        function bindProgressNoteButtons() {

            /*
             * VIEW / HIDE NOTES
             */

            document
                .querySelectorAll(
                    ".toggle-notes-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const caseId =
                                    button.dataset.caseId;


                                const panel =
                                    document.getElementById(
                                        `notesPanel-${caseId}`
                                    );


                                if (!panel) {

                                    console.error(
                                        "Progress notes panel not found:",
                                        caseId
                                    );

                                    return;

                                }


                                const isHidden =
                                    panel.classList.contains(
                                        "hidden"
                                    );


                                if (isHidden) {

                                    panel.classList.remove(
                                        "hidden"
                                    );


                                    button.textContent =
                                        "Hide Notes";


                                    await loadProgressNotes(
                                        caseId
                                    );

                                } else {

                                    panel.classList.add(
                                        "hidden"
                                    );


                                    button.textContent =
                                        "View Notes";

                                }

                            }
                        );

                    }
                );


            /*
             * SAVE NOTE
             */

            document
                .querySelectorAll(
                    ".save-progress-note-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                saveProgressNote(
                                    button.dataset.caseId,
                                    button
                                );

                            }
                        );

                    }
                );

        }


        // =============================================
        // LOAD PROGRESS NOTES
        // =============================================

        async function loadProgressNotes(
            caseId
        ) {

            const notesList =
                document.getElementById(
                    `notesList-${caseId}`
                );


            if (!notesList) {

                console.error(
                    "Progress notes list not found:",
                    caseId
                );

                return;

            }


            notesList.innerHTML =
                "<p>Loading progress notes...</p>";


            try {

                const data =
                    await apiRequest(
                        `/cases/${caseId}/notes`
                    );


                const notes =
                    data.items || [];


                if (!notes.length) {

                    notesList.innerHTML = `

                        <div class="empty-notes">

                            <p>
                                No progress notes have
                                been recorded for this
                                case yet.
                            </p>

                        </div>

                    `;

                    return;

                }


                notesList.innerHTML =
                    notes.map(
                        note => `

                            <article class="progress-note-item">

                                <div class="progress-note-meta">

                                    <strong>
                                        Progress Note
                                    </strong>

                                    <span>
                                        ${formatDateTime(
                                            note.created_at
                                        )}
                                    </span>

                                </div>


                                <p>
                                    ${escapeHtml(
                                        note.note
                                    )}
                                </p>

                            </article>

                        `
                    ).join("");


            } catch (error) {

                console.error(
                    "Unable to load progress notes:",
                    error
                );


                notesList.innerHTML = `

                    <div class="message error">

                        ${
                            escapeHtml(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to load progress notes."
                            )
                        }

                    </div>

                `;

            }

        }


        // =============================================
        // SAVE PROGRESS NOTE
        // =============================================

        async function saveProgressNote(
            caseId,
            button
        ) {

            /*
             * IMPORTANT:
             * No hideCaseMessage() call here.
             * The previous version called a function
             * that did not exist, which stopped the
             * save operation before the API request.
             */


            const textarea =
                document.getElementById(
                    `progressNote-${caseId}`
                );


            if (!textarea) {

                console.error(
                    "Progress note textarea not found:",
                    caseId
                );


                showMessage(
                    "Unable to locate the progress note field.",
                    "error"
                );

                return;

            }


            const noteText =
                textarea.value.trim();


            if (
                noteText.length <
                3
            ) {

                showMessage(
                    "Progress note must contain at least 3 characters.",
                    "error"
                );


                textarea.focus();

                return;

            }


            const originalText =
                button.textContent.trim();


            button.disabled =
                true;


            button.textContent =
                "Saving...";


            try {

                const data =
                    await apiRequest(
                        `/cases/${caseId}/notes`,
                        {
                            method:
                                "POST",

                            body:
                                JSON.stringify({
                                    note:
                                        noteText
                                })
                        }
                    );


                console.log(
                    "Progress note saved:",
                    data
                );


                textarea.value =
                    "";


                showMessage(
                    "Confidential progress note saved successfully.",
                    "success"
                );


                /*
                 * Reload the list so the newly
                 * created note appears immediately.
                 */

                await loadProgressNotes(
                    caseId
                );


            } catch (error) {

                console.error(
                    "Unable to save progress note:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to save the progress note.",
                    "error"
                );


            } finally {

                button.disabled =
                    false;


                button.textContent =
                    originalText;

            }

        }


        // =============================================
        // CASE LIFECYCLE ACTIONS
        // =============================================

        function renderCaseActions(
            caseItem
        ) {

            const status =
                caseItem.status;


            // -----------------------------------------
            // INTAKE -> ACTIVE
            // -----------------------------------------

            if (
                status ===
                "INTAKE"
            ) {

                return `

                    <div class="case-lifecycle-actions">

                        <div class="case-next-action">

                            <div>

                                <strong>
                                    Intake Review
                                </strong>

                                <p>
                                    When the intake review
                                    is complete, begin active
                                    counseling for this case.
                                </p>

                            </div>


                            <button
                                type="button"
                                class="btn btn-primary case-status-button"
                                data-case-id="${caseItem.id}"
                                data-next-status="ACTIVE"
                            >
                                Begin Active Counseling
                            </button>

                        </div>

                    </div>

                `;

            }


            // -----------------------------------------
            // ACTIVE -> FOLLOW_UP
            // -----------------------------------------

            if (
                status ===
                "ACTIVE"
            ) {

                return `

                    <div class="case-lifecycle-actions">

                        <div class="case-next-action">

                            <div>

                                <strong>
                                    Active Counseling
                                </strong>

                                <p>
                                    Counseling is currently
                                    active. Move the case to
                                    follow-up when continued
                                    monitoring is required.
                                </p>

                            </div>


                            <button
                                type="button"
                                class="btn btn-primary case-status-button"
                                data-case-id="${caseItem.id}"
                                data-next-status="FOLLOW_UP"
                            >
                                Move to Follow-Up
                            </button>

                        </div>

                    </div>

                `;

            }


            // -----------------------------------------
            // FOLLOW_UP -> CLOSED
            // -----------------------------------------

            if (
                status ===
                "FOLLOW_UP"
            ) {

                return `

                    <div class="case-lifecycle-actions">

                        <div class="case-next-action">

                            <div>

                                <strong>
                                    Follow-Up
                                </strong>

                                <p>
                                    Follow-up is currently
                                    in progress. Close the
                                    case once the counseling
                                    requirements have been
                                    completed.
                                </p>

                            </div>


                            <button
                                type="button"
                                class="btn btn-primary case-status-button"
                                data-case-id="${caseItem.id}"
                                data-next-status="CLOSED"
                            >
                                Close Case
                            </button>

                        </div>

                    </div>

                `;

            }

            // -----------------------------------------
            // CLOSED
            // -----------------------------------------

            if (
                status ===
                "CLOSED"
            ) {

                return `

                    <div class="case-lifecycle-actions">

                        <div class="case-closed-notice">

                            <div>

                                <strong>
                                    Case Closed
                                </strong>

                                <p>
                                    The counseling lifecycle
                                    for this case has been
                                    completed.
                                </p>

                            </div>


                            <button
                                type="button"
                                class="btn btn-outline print-case-summary-button"
                                data-case-id="${caseItem.id}"
                            >
                                Print Case Summary
                            </button>

                        </div>

                    </div>

                `;

            }

            return "";

        }


        // =============================================
        // BIND CASE STATUS BUTTONS
        // =============================================

        function bindCaseStatusButtons() {

            document
                .querySelectorAll(
                    ".case-status-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                changeCaseStatus(
                                    button.dataset.caseId,
                                    button.dataset.nextStatus,
                                    button
                                );

                            }
                        );

                    }
                );

        }
        
        // =============================================
        // BIND CASE SUMMARY BUTTONS
        // =============================================

        function bindCaseSummaryButtons() {

            document
                .querySelectorAll(
                    ".print-case-summary-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const caseId =
                                    button.dataset.caseId;

                                await printCaseSummary(
                                    caseId
                                );

                            }
                        );

                    }
                );

        }

        // =============================================
        // PRINT CONFIDENTIAL CASE SUMMARY
        // =============================================

        async function printCaseSummary(caseId) {

            try {

                const token =
                    getAccessToken();


                if (!token) {

                    showMessage(
                        "Your session has expired. Please log in again.",
                        "error"
                    );

                    return;
                }


                const response = await apiDownload(
                    `/reports/cases/${caseId}/summary.pdf`
                );
                if (!response) {
                    return;
                }


                if (!response.ok) {

                    let message =
                        "Unable to open the confidential case summary.";


                    try {

                        const errorData =
                            await response.json();

                        message =
                            errorData.message ||
                            message;

                    } catch {
                        // Response was not JSON.
                    }


                    throw new Error(
                        message
                    );

                }


                const pdfBlob =
                    await response.blob();


                const pdfUrl =
                    URL.createObjectURL(
                        pdfBlob
                    );


                const pdfWindow =
                    window.open(
                        pdfUrl,
                        "_blank"
                    );


                if (!pdfWindow) {

                    URL.revokeObjectURL(
                        pdfUrl
                    );

                    showMessage(
                        "The browser blocked the PDF. Please allow pop-ups for this site.",
                        "error"
                    );

                    return;
                }


                setTimeout(
                    () => {

                        URL.revokeObjectURL(
                            pdfUrl
                        );

                    },
                    60000
                );


            } catch (error) {

                console.error(
                    "Unable to print case summary:",
                    error
                );


                showMessage(
                    error?.message ||
                    "Unable to open the confidential case summary.",
                    "error"
                );

            }

        }

        // =============================================
        // CHANGE CASE STATUS
        // =============================================

        async function changeCaseStatus(
            caseId,
            nextStatus,
            button
        ) {

            const originalText =
                button.textContent.trim();


            button.disabled =
                true;


            if (
                nextStatus ===
                "ACTIVE"
            ) {

                button.textContent =
                    "Starting...";

            } else if (
                nextStatus ===
                "FOLLOW_UP"
            ) {

                button.textContent =
                    "Updating...";

            } else if (
                nextStatus ===
                "CLOSED"
            ) {

                button.textContent =
                    "Closing...";

            }


            try {

                await apiRequest(
                    `/cases/${caseId}/status`,
                    {
                        method:
                            "PATCH",

                        body:
                            JSON.stringify({
                                status:
                                    nextStatus
                            })
                    }
                );


                let successMessage =
                    "Case status updated successfully.";


                if (
                    nextStatus ===
                    "ACTIVE"
                ) {

                    successMessage =
                        "Case moved to Active Counseling.";

                }


                if (
                    nextStatus ===
                    "FOLLOW_UP"
                ) {

                    successMessage =
                        "Case moved to Follow-Up.";

                }


                if (
                    nextStatus ===
                    "CLOSED"
                ) {

                    successMessage =
                        "Counseling case closed successfully.";

                }


                showMessage(
                    successMessage,
                    "success"
                );


                await loadCases();


            } catch (error) {

                console.error(
                    "Unable to update case status:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to update the case status.",
                    "error"
                );


                button.disabled =
                    false;


                button.textContent =
                    originalText;

            }

        }


        // =============================================
        // STATUS FILTER
        // =============================================

        if (statusFilter) {

            statusFilter.addEventListener(
                "change",
                loadCases
            );

        }


        // =============================================
        // HELPERS
        // =============================================

        function formatStatus(status) {

            if (!status) {
                return "—";
            }


            return String(status)
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


        // =============================================
        // DATE ONLY
        // =============================================

        function formatDate(value) {

            if (!value) {
                return "—";
            }


            const date =
                new Date(value);


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {

                return value;

            }


            return date.toLocaleDateString(
                undefined,
                {
                    year:
                        "numeric",

                    month:
                        "short",

                    day:
                        "numeric"
                }
            );

        }


        // =============================================
        // DATE + TIME
        // =============================================

        function formatDateTime(value) {

            if (!value) {
                return "—";
            }


            /*
            * Backend timestamps are stored in UTC.
            *
            * If the API returns a timestamp without
            * "Z" or a timezone offset, explicitly
            * mark it as UTC before JavaScript parses it.
            */

            let normalizedValue =
                String(value);


            const hasTimezone =
                normalizedValue.endsWith("Z") ||
                /[+-]\d{2}:\d{2}$/.test(
                    normalizedValue
                );


            if (!hasTimezone) {

                normalizedValue +=
                    "Z";

            }


            const date =
                new Date(
                    normalizedValue
                );


            if (
                Number.isNaN(
                    date.getTime()
                )
            ) {

                return value;

            }


            return date.toLocaleString(
                undefined,
                {
                    year:
                        "numeric",

                    month:
                        "short",

                    day:
                        "numeric",

                    hour:
                        "numeric",

                    minute:
                        "2-digit",

                    hour12:
                        true
                }
            );

        }


        // =============================================
        // MESSAGE
        // =============================================

        function showMessage(
            message,
            type
        ) {

            if (!messageBox) {

                console.log(
                    `[${type}]`,
                    message
                );

                return;

            }


            messageBox.textContent =
                message;


            messageBox.className =
                `message ${type}`;

        }


        // =============================================
        // HTML ESCAPING
        // =============================================

        function escapeHtml(value) {

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

        // =============================================
        // SHARED SIDEBAR NAVIGATION
        // =============================================

        const dashboardNav =
            document.getElementById(
                "dashboardNav"
            );

        const appointmentsNav =
            document.getElementById(
                "appointmentsNav"
            );

        const referralsNav =
            document.getElementById(
                "referralsNav"
            );

        const exitNav =
            document.getElementById(
                "exitNav"
            );

        const clearanceNav =
            document.getElementById(
                "clearanceNav"
            );

        const adminNav =
            document.getElementById(
                "adminNav"
            );

        const profileButton =
            document.getElementById(
                "profileButton"
            );

        const logoutButton =
            document.getElementById(
                "logoutButton"
            );



        if (dashboardNav) {

            dashboardNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard";

                }
            );

        }



        if (appointmentsNav) {

            appointmentsNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/appointments";

                }
            );

        }



        if (referralsNav) {

            referralsNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/referrals";

                }
            );

        }



        if (exitNav) {

            exitNav.addEventListener(
                "click",
                () => {

                    if (
                        currentRole === "admin" ||
                        currentRole === "head_counselor" ||
                        currentRole === "staff"
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



        if (clearanceNav) {

            clearanceNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/clearance";

                }
            );

        }



        if (adminNav) {

            adminNav.addEventListener(
                "click",
                () => {

                    if (
                        currentRole === "admin"
                    ) {

                        window.location.href =
                            "/admin-management";

                    }

                }
            );

        }



        if (profileButton) {

            profileButton.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/dashboard";

                }
            );

        }



        // =============================================
        // LOGOUT
        // =============================================

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
                            "Logout error:",
                            error
                        );

                    } finally {

                        clearSession();

                        window.location.href =
                            "/";

                    }

                }
            );

        }
        
        // =============================================
        // INITIAL LOAD
        // =============================================

        try {

            await loadCurrentUser();

            await loadCases();

        } catch (error) {

            console.error(
                "Case page initialization error:",
                error
            );


            showMessage(
                error?.data?.message ||
                error?.data?.error ||
                "Unable to initialize the counseling cases page.",
                "error"
            );

        }

    }
);
