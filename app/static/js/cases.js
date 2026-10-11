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

                                ${
                                    currentRole !== "staff"
                                        ? `
                                            <p>
                                                <strong>Concern:</strong>
                                                ${escapeHtml(caseItem.category)}
                                            </p>

                                            <p>
                                                <strong>Priority:</strong>
                                                ${escapeHtml(formatStatus(caseItem.priority))}
                                            </p>
                                        `
                                        : ""
                                }

                                <p>
                                    <strong>Opened:</strong>
                                    ${formatDate(caseItem.opened_at)}
                                </p>

                                <p>
                                    <strong>Current Status:</strong>
                                    ${escapeHtml(formatStatus(caseItem.status))}
                                </p>

                                ${
                                    currentRole === "staff" && caseItem.closed_at
                                        ? `
                                            <p>
                                                <strong>Closed:</strong>
                                                ${formatDate(caseItem.closed_at)}
                                            </p>
                                        `
                                        : ""
                                }

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
                            ${
                                currentRole === "counselor" &&
                                caseItem.status === "CLOSED"
                                    ? `
                                        <div class="case-lifecycle-actions">
                                            <button
                                                type="button"
                                                class="btn btn-outline draft-student-summary-button"
                                                data-case-id="${caseItem.id}"
                                            >
                                                Prepare Student Summary
                                            </button>
                                        </div>
                                    `
                                    : ""
                            }                                                      
                            ${
                                currentRole === "head_counselor" &&
                                caseItem.status === "CLOSED"
                                    ? `
                                        <div class="case-lifecycle-actions">
                                            <div class="progress-note-actions">
                                                <button
                                                    type="button"
                                                    class="btn btn-outline review-student-summary-button"
                                                    data-case-id="${caseItem.id}"
                                                >
                                                    Review Student Summary
                                                </button>

                                                <button
                                                    type="button"
                                                    class="btn btn-primary release-student-summary-button"
                                                    data-case-id="${caseItem.id}"
                                                >
                                                    Release Student Summary
                                                </button>
                                            </div>
                                        </div>
                                    `
                                    : ""
                            }
                                ${
                                    currentRole === "head_counselor" &&
                                    caseItem.status === "CLOSED"
                                        ? `
                                            <div class="case-lifecycle-actions">
                                                <button
                                                    type="button"
                                                    class="btn btn-outline print-case-summary-button"
                                                    data-case-id="${caseItem.id}"
                                                >
                                                    Print Case Summary
                                                </button>
                                            </div>
                                        `
                                        : ""
                                }
                                        ${
                                            currentRole === "student" &&
                                            caseItem.status === "CLOSED"
                                                ? `
                                                    <div class="case-lifecycle-actions">
                                                        <button
                                                            type="button"
                                                            class="btn btn-outline view-released-summary-button"
                                                            data-case-id="${caseItem.id}"
                                                        >
                                                            View Released Summary
                                                        </button>
                                                    </div>
                                                `
                                                : ""
                                        }
                        </article>

                    `;

                }).join("");


            /*
             * The case cards have now been inserted
             * into the DOM, so their buttons can
             * safely receive event listeners.
             */

            
            bindCaseStatusButtons();
            bindRequestClosureButtons();
            bindReviewClosureButtons();
            bindViewClosureRequestButtons();
            bindRevisionFeedbackButtons();
            bindProgressNoteButtons();
            bindCaseSummaryButtons();
            bindDraftStudentSummaryButtons();
            bindReviewStudentSummaryButtons();
            bindReleaseStudentSummaryButtons();      
            bindViewReleasedSummaryButtons();   
        }


        // =============================================
        // CASE PROGRESS
        // =============================================
        function renderProgress(status) {
            const stages = [
                "INTAKE",
                "ACTIVE",
                "FOLLOW_UP",
                "PENDING_CLOSURE",
                "CLOSED"
            ];

            const isRevision = status === "REVISION_REQUIRED";

            const currentIndex = isRevision
                ? stages.indexOf("FOLLOW_UP")
                : stages.indexOf(status);

            return `
                <div class="case-progress">
                    ${
                        stages.map((stage, index) => {
                            let state = "upcoming";
                            let stateLabel = "Next";
                            let symbol = index + 1;

                            if (index < currentIndex) {
                                state = "completed";
                                stateLabel = "Completed";
                                symbol = "✓";
                            }

                            if (index === currentIndex) {
                                state = "current";
                                stateLabel = isRevision
                                    ? "Revision Required"
                                    : stage === "CLOSED"
                                        ? "Closed"
                                        : "Current";

                                symbol = stage === "CLOSED"
                                    ? "✓"
                                    : "●";
                            }

                            return `
                                <div class="progress-stage ${state}">
                                    <span class="progress-circle">
                                        ${symbol}
                                    </span>

                                    <small class="progress-stage-name">
                                        ${formatStatus(stage)}
                                    </small>

                                    <small class="progress-stage-state">
                                        ${stateLabel}
                                    </small>
                                </div>
                            `;
                        }).join("")
                    }
                </div>

                ${
                    isRevision
                        ? `
                            <div class="message warning">
                                This case was returned by the Head Counselor
                                for revision. The assigned Counselor must
                                address the review feedback before requesting
                                closure again.
                            </div>
                        `
                        : ""
                }
            `;
        }



        // =============================================
        // PROGRESS NOTES
        // =============================================

        function renderProgressNotes(caseItem) 
        {         
            // Confidential counseling notes are restricted
            // to Counselors and the Head Counselor.
            if (
                currentRole !== "counselor" &&
                currentRole !== "head_counselor"
            ) {
                return "";
            }
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
                            (
                                currentRole === "counselor" &&
                                ["ACTIVE", "FOLLOW_UP", "REVISION_REQUIRED"].includes(caseItem.status)
                            )
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
                                            ${
                                                caseItem.status === "PENDING_CLOSURE"
                                                    ? "This case is awaiting Head Counselor approval. Progress notes are available for authorized review but cannot be modified."
                                                    : caseItem.status === "CLOSED"
                                                        ? "This case is closed. Existing progress notes remain available for authorized review."
                                                        : "Progress notes are available for authorized review."
                                            }
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
                                ${
                                    note.available === false
                                        ? `
                                            <div class="message warning">
                                                <strong>Historical Note Unavailable</strong>
                                                <p>
                                                    This progress note is preserved in the
                                                    database, but its original encryption
                                                    key is currently unavailable.
                                                </p>
                                            </div>
                                        `
                                        : `
                                            <p>
                                                ${escapeHtml(note.note)}
                                            </p>
                                        `
                                }
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
                // Students, Admins, and Staff cannot perform
                // counseling lifecycle actions.
                if (
                    currentRole === "student" ||
                    currentRole === "admin" ||
                    currentRole === "staff"
                ) {
                    return "";
                }

                // The Head Counselor only performs closure reviews.
                // The PENDING_CLOSURE section below remains accessible.
                if (
                    currentRole === "head_counselor" &&
                    status !== "PENDING_CLOSURE"
                ) {
                    return "";
                }
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

                            <div class="progress-note-actions">
                                <button
                                    type="button"
                                    class="btn btn-primary case-status-button"
                                    data-case-id="${caseItem.id}"
                                    data-next-status="FOLLOW_UP"
                                >
                                    Move to Follow-Up
                                </button>

                                <button
                                    type="button"
                                    class="btn btn-outline request-closure-button"
                                    data-case-id="${caseItem.id}"
                                >
                                    Request Case Closure
                                </button>
                            </div>

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
                                    Follow-up is currently in progress.
                                    Once counseling requirements are complete,
                                    the assigned Counselor may request closure
                                    for Head Counselor approval.
                                </p>

                            </div>

                            ${
                                currentRole === "counselor"
                                    ? `
                                        <button
                                            type="button"
                                            class="btn btn-primary request-closure-button"
                                            data-case-id="${caseItem.id}"
                                        >
                                            Request Case Closure
                                        </button>
                                    `
                                    : ""
                            }

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
            
            // -----------------------------------------
            // PENDING CLOSURE
            // -----------------------------------------

            if (status === "PENDING_CLOSURE") {
                if (currentRole === "head_counselor") {
                    return `
                        <div class="case-lifecycle-actions">
                            <div class="case-next-action">
                                <div>
                                    <strong>Closure Review Required</strong>
                                    <p>
                                        The assigned Counselor has requested
                                        case closure. Review the case before
                                        approving or returning it for revision.
                                    </p>
                                </div>

                                <div class="progress-note-actions">
                                    <button
                                        type="button"
                                        class="btn btn-outline view-closure-request-button"
                                        data-case-id="${caseItem.id}"
                                    >
                                        Review Closure Request
                                    </button>

                                    <button
                                        type="button"
                                        class="btn btn-primary review-closure-button"
                                        data-case-id="${caseItem.id}"
                                        data-decision="APPROVE"
                                    >
                                        Approve Closure
                                    </button>

                                    <button
                                        type="button"
                                        class="btn btn-outline review-closure-button"
                                        data-case-id="${caseItem.id}"
                                        data-decision="RETURN"
                                    >
                                        Return for Revision
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="case-lifecycle-actions">
                        <div class="case-closed-notice">
                            <div>
                                <strong>Awaiting Closure Review</strong>
                                <p>
                                    This case is pending Head Counselor approval.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
            }

            // -----------------------------------------
            // REVISION REQUIRED
            // -----------------------------------------

            if (status === "REVISION_REQUIRED") {
                if (currentRole === "counselor") {
                    return `
                        <div class="case-lifecycle-actions">
                            <div class="case-next-action">
                                <div>
                                    <strong>Revision Required</strong>
                                    <p>
                                        The Head Counselor returned this case.
                                        Address the feedback before submitting
                                        another closure request.
                                    </p>
                                </div>

                                <div class="progress-note-actions">
                                    <button
                                        type="button"
                                        class="btn btn-outline view-revision-feedback-button"
                                        data-case-id="${caseItem.id}"
                                    >
                                        View Revision Feedback
                                    </button>

                                    <button
                                        type="button"
                                        class="btn btn-primary request-closure-button"
                                        data-case-id="${caseItem.id}"
                                    >
                                        Resubmit Closure Request
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }

                return `
                    <div class="case-lifecycle-actions">
                        <div class="case-closed-notice">
                            <div>
                                <strong>Case Under Revision</strong>
                                <p>
                                    Additional counseling review is required.
                                </p>
                            </div>
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
        
        function showStudentSummaryDialog() {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    box-sizing: border-box;
                    width: min(580px, calc(100% - 32px));
                    max-height: 85vh;
                    margin: auto;
                    position: fixed;
                    inset: 0;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: #ffffff;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                    overflow-y: auto;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 10px; font-size: 22px;">
                        Prepare Student Summary
                    </h2>

                    <p style="
                        color: #796b91;
                        line-height: 1.5;
                        font-size: 14px;
                        margin: 0 0 18px;
                    ">
                        Write a student-facing counseling summary.
                        Do not include confidential progress notes,
                        internal closure-review information, or
                        sensitive details that should remain private.
                    </p>

                    <label for="studentSummaryInput" style="
                        display: block;
                        margin-bottom: 8px;
                        font-size: 14px;
                        font-weight: 600;
                    ">
                        Student Summary
                    </label>

                    <textarea
                        id="studentSummaryInput"
                        rows="7"
                        maxlength="5000"
                        placeholder="Write the summary that may be shared with the student after Head Counselor approval..."
                        style="
                            box-sizing: border-box;
                            width: 100%;
                            padding: 14px;
                            border: 1px solid #dfd0f5;
                            border-radius: 10px;
                            background: white;
                            color: #24143d;
                            font: inherit;
                            line-height: 1.6;
                            resize: vertical;
                        "
                    ></textarea>

                    <p style="
                        margin: 8px 0 16px;
                        color: #796b91;
                        font-size: 12px;
                    ">
                        10–5000 characters. The summary will be saved
                        as a private draft until it is reviewed and released.
                    </p>

                    <p id="studentSummaryError" style="
                        display: none;
                        color: #c53030;
                        font-size: 13px;
                        margin: 0 0 14px;
                    ">
                        Please enter between 10 and 5000 characters.
                    </p>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                        flex-wrap: wrap;
                    ">
                        <button type="button" id="cancelStudentSummary"
                            style="
                                padding: 11px 18px;
                                background: white;
                                border: 1px solid #d9c5f7;
                                border-radius: 9px;
                                color: #7532d8;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                            Cancel
                        </button>

                        <button type="button" id="saveStudentSummary"
                            style="
                                padding: 11px 18px;
                                background: #873ef0;
                                border: none;
                                border-radius: 9px;
                                color: white;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                            Save Draft
                        </button>
                    </div>
                `;

                document.body.appendChild(dialog);

                const textarea =
                    dialog.querySelector("#studentSummaryInput");

                const errorMessage =
                    dialog.querySelector("#studentSummaryError");

                let finished = false;

                function finish(value) {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve(value);
                }

                dialog.querySelector("#cancelStudentSummary")
                    .addEventListener("click", () => finish(null));

                dialog.querySelector("#saveStudentSummary")
                    .addEventListener("click", () => {
                        const summary = textarea.value.trim();

                        if (summary.length < 10 || summary.length > 5000) {
                            errorMessage.style.display = "block";
                            textarea.focus();
                            return;
                        }

                        finish(summary);
                    });

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish(null);
                });

                dialog.showModal();
                textarea.focus();
            });
        }

        function bindDraftStudentSummaryButtons() {
            document
                .querySelectorAll(".draft-student-summary-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "counselor") {
                            return;
                        }

                        const caseId = button.dataset.caseId;

                        const summary = await showStudentSummaryDialog();

                        if (summary === null) {
                            return;
                        }

                        const cleanedSummary = summary.trim();

                        if (
                            cleanedSummary.length < 10 ||
                            cleanedSummary.length > 5000
                        ) {
                            showMessage(
                                "Student summary must contain between " +
                                "10 and 5000 characters.",
                                "error"
                            );
                            return;
                        }

                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Saving Draft...";

                        try {
                            const response = await apiRequest(
                                `/cases/${caseId}/student-summary`,
                                {
                                    method: "PUT",
                                    body: JSON.stringify({
                                        student_summary: cleanedSummary
                                    })
                                }
                            );

                            showMessage(
                                response.message ||
                                "Student summary saved as a private draft.",
                                "success"
                            );

                        } catch (error) {
                            console.error(
                                "Unable to save student summary:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to save the student summary.",
                                "error"
                            );

                        } finally {
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        function showStudentSummaryReviewDialog(data) {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    box-sizing: border-box;
                    width: min(600px, calc(100% - 32px));
                    max-height: 85vh;
                    margin: auto;
                    position: fixed;
                    inset: 0;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: white;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                    overflow-y: auto;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 8px; font-size: 22px;">
                        Review Student Summary
                    </h2>

                    <p style="
                        color: #796b91;
                        font-size: 14px;
                        line-height: 1.5;
                        margin-bottom: 20px;
                    ">
                        Review the student-facing summary before
                        authorizing its release.
                    </p>

                    <div style="
                        background: #faf7ff;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        padding: 15px;
                        margin-bottom: 18px;
                    ">
                        <strong>Case Number:</strong>
                        <span id="reviewStudentCaseNumber"></span>
                        <p style="margin: 10px 0 0;">
                            <strong>Release Status:</strong>
                            <span id="reviewStudentReleaseStatus"></span>
                        </p>
                    </div>

                    <h3 style="font-size: 14px; margin-bottom: 10px;">
                        Student-Facing Summary
                    </h3>

                    <div id="reviewStudentSummaryText" style="
                        padding: 16px;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        line-height: 1.7;
                        white-space: pre-wrap;
                        overflow-wrap: anywhere;
                        max-height: 300px;
                        overflow-y: auto;
                        font-size: 14px;
                    "></div>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        margin-top: 22px;
                    ">
                        <button type="button" id="closeStudentReview"
                            style="
                                padding: 11px 22px;
                                border: none;
                                border-radius: 9px;
                                background: #873ef0;
                                color: white;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                            Close Review
                        </button>
                    </div>
                `;

                dialog.querySelector("#reviewStudentCaseNumber")
                    .textContent = data.case_number || "Unavailable";

                dialog.querySelector("#reviewStudentReleaseStatus")
                    .textContent = data.released
                        ? "Released"
                        : "Not Released";

                dialog.querySelector("#reviewStudentSummaryText")
                    .textContent = data.student_summary ||
                        "No student summary available.";

                document.body.appendChild(dialog);

                let finished = false;

                function finish() {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve();
                }

                dialog.querySelector("#closeStudentReview")
                    .addEventListener("click", finish);

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish();
                });

                dialog.showModal();
            });
        }

        function bindReviewStudentSummaryButtons() {
            document
                .querySelectorAll(".review-student-summary-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "head_counselor") {
                            return;
                        }

                        const caseId = button.dataset.caseId;
                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Loading...";

                        try {
                            const data = await apiRequest(
                                `/cases/${caseId}/student-summary/review`
                            );

                            await showStudentSummaryReviewDialog(data);

                        } catch (error) {
                            console.error(
                                "Unable to review student summary:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to retrieve the student summary.",
                                "error"
                            );

                        } finally {
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        function showReleaseStudentSummaryDialog() {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    box-sizing: border-box;
                    width: min(500px, calc(100% - 32px));
                    max-height: 85vh;
                    margin: auto;
                    position: fixed;
                    inset: 0;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: #ffffff;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                    overflow-y: auto;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 12px; font-size: 22px;">
                        Release Student Summary
                    </h2>

                    <p style="
                        margin: 0 0 16px;
                        font-size: 14px;
                        line-height: 1.6;
                        color: #796b91;
                    ">
                        Are you sure you want to release this
                        student-facing summary?
                    </p>

                    <div style="
                        background: #faf7ff;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        padding: 16px;
                        margin-bottom: 22px;
                        font-size: 14px;
                        line-height: 1.6;
                    ">
                        Confirm that you have reviewed the summary
                        and that it contains no confidential progress
                        notes or internal counseling information.

                        <p style="margin: 10px 0 0; font-weight: 600;">
                            Once released, the Student will be
                            able to view this summary.
                        </p>
                    </div>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                        flex-wrap: wrap;
                    ">
                        <button type="button" id="cancelSummaryRelease"
                            style="
                                padding: 11px 18px;
                                background: white;
                                color: #7532d8;
                                border: 1px solid #d9c5f7;
                                border-radius: 9px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                            Cancel
                        </button>

                        <button type="button" id="confirmSummaryRelease"
                            style="
                                padding: 11px 18px;
                                background: #873ef0;
                                color: white;
                                border: none;
                                border-radius: 9px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                            Release Summary
                        </button>
                    </div>
                `;

                document.body.appendChild(dialog);

                let finished = false;

                function finish(confirmed) {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve(confirmed);
                }

                dialog.querySelector("#cancelSummaryRelease")
                    .addEventListener("click", () => finish(false));

                dialog.querySelector("#confirmSummaryRelease")
                    .addEventListener("click", () => finish(true));

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish(false);
                });

                dialog.showModal();
            });
        }

        function bindReleaseStudentSummaryButtons() {
            document
                .querySelectorAll(".release-student-summary-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "head_counselor") {
                            return;
                        }

                        const caseId = button.dataset.caseId;

                        const confirmed = await showReleaseStudentSummaryDialog();

                        if (!confirmed) {
                            return;
                        }

                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Releasing...";

                        try {
                            const response = await apiRequest(
                                `/cases/${caseId}/student-summary/release`,
                                {
                                    method: "POST"
                                }
                            );

                            showMessage(
                                response.message ||
                                "Student-facing summary released successfully.",
                                "success"
                            );

                            await loadCases();

                        } catch (error) {
                            console.error(
                                "Unable to release student summary:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to release the student summary.",
                                "error"
                            );

                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        function showReleasedStudentSummaryDialog(data) {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    box-sizing: border-box;
                    width: min(600px, calc(100% - 32px));
                    max-height: 85vh;
                    margin: auto;
                    position: fixed;
                    inset: 0;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: #ffffff;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                    overflow-y: auto;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 8px; font-size: 22px;">
                        Your Counseling Summary
                    </h2>

                    <p style="
                        color: #796b91;
                        font-size: 14px;
                        line-height: 1.5;
                        margin: 0 0 20px;
                    ">
                        This summary was prepared by your Counselor
                        and released for your review.
                    </p>

                    <div style="
                        background: #faf7ff;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        padding: 15px;
                        margin-bottom: 18px;
                        font-size: 14px;
                    ">
                        <p style="margin: 0 0 10px;">
                            <strong>Case Number:</strong>
                            <span id="releasedSummaryCaseNumber"></span>
                        </p>

                        <p style="margin: 0;">
                            <strong>Released At:</strong>
                            <span id="releasedSummaryDate"></span>
                        </p>
                    </div>

                    <h3 style="
                        font-size: 14px;
                        margin: 0 0 10px;
                        color: #48216f;
                    ">
                        Student-Facing Summary
                    </h3>

                    <div id="releasedSummaryText" style="
                        padding: 16px;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        line-height: 1.7;
                        white-space: pre-wrap;
                        overflow-wrap: anywhere;
                        max-height: 300px;
                        overflow-y: auto;
                        font-size: 14px;
                    "></div>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        margin-top: 22px;
                    ">
                        <button
                            type="button"
                            id="closeReleasedSummary"
                            style="
                                padding: 11px 22px;
                                border: none;
                                border-radius: 9px;
                                background: #873ef0;
                                color: white;
                                font-weight: 600;
                                cursor: pointer;
                            "
                        >
                            Close
                        </button>
                    </div>
                `;

                dialog.querySelector("#releasedSummaryCaseNumber")
                    .textContent = data.case_number || "Unavailable";

                dialog.querySelector("#releasedSummaryDate")
                    .textContent = data.released_at
                        ? formatDateTime(data.released_at)
                        : "Not available";

                dialog.querySelector("#releasedSummaryText")
                    .textContent = data.student_summary ||
                        "No released summary is available.";

                document.body.appendChild(dialog);

                let finished = false;

                function finish() {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve();
                }

                dialog.querySelector("#closeReleasedSummary")
                    .addEventListener("click", finish);

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish();
                });

                dialog.showModal();
            });
        }

        function bindViewReleasedSummaryButtons() {
            document
                .querySelectorAll(".view-released-summary-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "student") {
                            return;
                        }

                        const caseId = button.dataset.caseId;
                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Loading...";

                        try {
                            const data = await apiRequest(
                                `/cases/${caseId}/student-summary`
                            );

                            await showReleasedStudentSummaryDialog(data);

                        } catch (error) {
                            console.error(
                                "Unable to load released summary:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "No released summary is available for this case.",
                                "error"
                            );

                        } finally {
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        function showClosureSummaryDialog() {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    width: min(540px, calc(100% - 32px));
                    max-height: 85vh;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: #ffffff;
                    color: #201638;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.22);
                    font-family: inherit;
                `;

                dialog.innerHTML = `
                    <form method="dialog" style="margin: 0;">
                        <h2 style="
                            margin: 0 0 8px;
                            font-size: 22px;
                            color: #24143d;
                        ">
                            Request Case Closure
                        </h2>

                        <p style="
                            margin: 0 0 22px;
                            color: #796b91;
                            line-height: 1.5;
                            font-size: 14px;
                        ">
                            Provide a closure summary for Head Counselor
                            review before submitting the request.
                        </p>

                        <label for="closureSummaryInput" style="
                            display: block;
                            margin-bottom: 8px;
                            font-weight: 600;
                            font-size: 14px;
                        ">
                            Closure Summary
                        </label>

                        <textarea
                            id="closureSummaryInput"
                            rows="6"
                            maxlength="5000"
                            placeholder="Describe the counseling outcome and reason for requesting closure..."
                            style="
                                box-sizing: border-box;
                                width: 100%;
                                padding: 14px;
                                border: 1px solid #dfd0f5;
                                border-radius: 10px;
                                background: white;
                                color: #24143d;
                                font: inherit;
                                line-height: 1.5;
                                resize: vertical;
                            "
                        ></textarea>

                        <p style="
                            margin: 6px 0 18px;
                            font-size: 12px;
                            color: #796b91;
                        ">
                            Minimum 10 characters.
                        </p>

                        <p id="closureSummaryError" style="
                            display: none;
                            margin-bottom: 14px;
                            color: #c53030;
                            font-size: 13px;
                        ">
                            Please enter at least 10 characters.
                        </p>

                        <div style="
                            display: flex;
                            justify-content: flex-end;
                            flex-wrap: wrap;
                            gap: 10px;
                        ">
                            <button
                                type="button"
                                id="closureCancelButton"
                                style="
                                    padding: 11px 19px;
                                    border: 1px solid #d9c5f7;
                                    border-radius: 9px;
                                    background: white;
                                    color: #7532d8;
                                    cursor: pointer;
                                    font-weight: 600;
                                "
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                id="closureSubmitButton"
                                style="
                                    padding: 11px 19px;
                                    border: none;
                                    border-radius: 9px;
                                    background: #873ef0;
                                    color: white;
                                    cursor: pointer;
                                    font-weight: 600;
                                "
                            >
                                Submit Request
                            </button>
                        </div>
                    </form>
                `;

                document.body.appendChild(dialog);

                const textarea =
                    dialog.querySelector("#closureSummaryInput");

                const errorMessage =
                    dialog.querySelector("#closureSummaryError");

                let finished = false;

                function finish(value) {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve(value);
                }

                dialog.querySelector("#closureCancelButton")
                    .addEventListener("click", () => finish(null));

                dialog.querySelector("#closureSubmitButton")
                    .addEventListener("click", () => {
                        const summary = textarea.value.trim();

                        if (summary.length < 10) {
                            errorMessage.style.display = "block";
                            textarea.focus();
                            return;
                        }

                        finish(summary);
                    });

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish(null);
                });

                dialog.showModal();
                textarea.focus();
            });
        }

        function bindRequestClosureButtons() {
            document
                .querySelectorAll(".request-closure-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        const caseId = button.dataset.caseId;

                        const summary = await showClosureSummaryDialog();

                        if (summary === null) {
                            return;
                        }

                        const cleanedSummary = summary.trim();

                        if (cleanedSummary.length < 10) {
                            showMessage(
                                "Closure summary must contain at least 10 characters.",
                                "error"
                            );
                            return;
                        }

                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Submitting...";

                        try {
                            await apiRequest(
                                `/cases/${caseId}/request-closure`,
                                {
                                    method: "POST",
                                    body: JSON.stringify({
                                        closure_summary: cleanedSummary
                                    })
                                }
                            );

                            showMessage(
                                "Closure request submitted for Head Counselor review.",
                                "success"
                            );

                            await loadCases();

                        } catch (error) {
                            console.error(
                                "Unable to request case closure:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to submit closure request.",
                                "error"
                            );

                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        function showApproveClosureDialog() {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    width: min(460px, calc(100% - 32px));
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: white;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 12px; font-size: 22px;">
                        Approve Case Closure
                    </h2>

                    <p style="
                        color: #796b91;
                        line-height: 1.6;
                        font-size: 14px;
                        margin: 0 0 24px;
                    ">
                        Are you sure you want to approve this
                        counseling case for closure?
                        <br><br>
                        Once approved, the case will be marked
                        <strong>CLOSED</strong> and its lifecycle
                        will be finalized.
                    </p>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    ">
                        <button type="button" id="cancelApproval"
                            style="
                                padding: 11px 18px;
                                background: white;
                                color: #7532d8;
                                border: 1px solid #d9c5f7;
                                border-radius: 9px;
                                cursor: pointer;
                            ">
                            Cancel
                        </button>

                        <button type="button" id="confirmApproval"
                            style="
                                padding: 11px 18px;
                                background: #873ef0;
                                color: white;
                                border: none;
                                border-radius: 9px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                            Approve Closure
                        </button>
                    </div>
                `;

                document.body.appendChild(dialog);

                let finished = false;

                function finish(approved) {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve(approved);
                }

                dialog.querySelector("#cancelApproval")
                    .addEventListener("click", () => finish(false));

                dialog.querySelector("#confirmApproval")
                    .addEventListener("click", () => finish(true));

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish(false);
                });

                dialog.showModal();
            });
        }
        
        function showReturnRevisionDialog() {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    width: min(540px, calc(100% - 32px));
                    max-height: 85vh;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: #ffffff;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                `;

                dialog.innerHTML = `
                    <h2 style="
                        margin: 0 0 8px;
                        font-size: 22px;
                    ">
                        Return Case for Revision
                    </h2>

                    <p style="
                        margin: 0 0 20px;
                        color: #796b91;
                        font-size: 14px;
                        line-height: 1.5;
                    ">
                        Explain what the assigned Counselor needs
                        to revise before requesting case closure again.
                    </p>

                    <label for="revisionRemarksInput" style="
                        display: block;
                        margin-bottom: 8px;
                        font-size: 14px;
                        font-weight: 600;
                    ">
                        Revision Remarks
                    </label>

                    <textarea
                        id="revisionRemarksInput"
                        rows="6"
                        maxlength="5000"
                        placeholder="Describe the revisions or additional follow-up required..."
                        style="
                            box-sizing: border-box;
                            width: 100%;
                            padding: 14px;
                            border: 1px solid #dfd0f5;
                            border-radius: 10px;
                            background: white;
                            color: #24143d;
                            font: inherit;
                            line-height: 1.5;
                            resize: vertical;
                        "
                    ></textarea>

                    <p id="revisionRemarksError" style="
                        display: none;
                        margin: 8px 0 14px;
                        color: #c53030;
                        font-size: 13px;
                    ">
                        Please enter a reason for returning this case.
                    </p>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        flex-wrap: wrap;
                        gap: 10px;
                        margin-top: 20px;
                    ">
                        <button
                            type="button"
                            id="cancelRevisionButton"
                            style="
                                padding: 11px 19px;
                                border: 1px solid #d9c5f7;
                                border-radius: 9px;
                                background: white;
                                color: #7532d8;
                                cursor: pointer;
                                font-weight: 600;
                            "
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            id="submitRevisionButton"
                            style="
                                padding: 11px 19px;
                                border: none;
                                border-radius: 9px;
                                background: #873ef0;
                                color: white;
                                cursor: pointer;
                                font-weight: 600;
                            "
                        >
                            Return for Revision
                        </button>
                    </div>
                `;

                document.body.appendChild(dialog);

                let finished = false;

                function finish(value) {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve(value);
                }

                const textarea =
                    dialog.querySelector("#revisionRemarksInput");

                const errorMessage =
                    dialog.querySelector("#revisionRemarksError");

                dialog.querySelector("#cancelRevisionButton")
                    .addEventListener("click", () => finish(null));

                dialog.querySelector("#submitRevisionButton")
                    .addEventListener("click", () => {
                        const remarks = textarea.value.trim();

                        if (!remarks) {
                            errorMessage.style.display = "block";
                            textarea.focus();
                            return;
                        }

                        finish(remarks);
                    });

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    finish(null);
                });

                dialog.showModal();
                textarea.focus();
            });
        }

        function bindReviewClosureButtons() {
            document
                .querySelectorAll(".review-closure-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "head_counselor") {
                            return;
                        }

                        const caseId = button.dataset.caseId;
                        const decision = button.dataset.decision;

                        let remarks = null;

                        if (decision === "APPROVE") {
                            const confirmed = await showApproveClosureDialog();

                            if (!confirmed) return;

                        } else if (decision === "RETURN") {
                            remarks = await showReturnRevisionDialog();

                            if (remarks === null) return;

                            remarks = remarks.trim();

                            if (!remarks) {
                                showMessage(
                                    "Review remarks are required.",
                                    "error"
                                );
                                return;
                            }
                        } else {
                            return;
                        }

                        const originalText = button.textContent.trim();
                        button.disabled = true;
                        button.textContent = "Processing...";

                        try {
                            const response = await apiRequest(
                                `/cases/${caseId}/review-closure`,
                                {
                                    method: "POST",
                                    body: JSON.stringify({
                                        decision,
                                        remarks
                                    })
                                }
                            );

                            showMessage(
                                response.message ||
                                "Closure review completed successfully.",
                                "success"
                            );

                            await loadCases();

                        } catch (error) {
                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to review case closure.",
                                "error"
                            );

                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        
        function showClosureReviewDialog(data) {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    width: min(620px, calc(100% - 32px));
                    max-height: 85vh;
                    padding: 0;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: #ffffff;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                    overflow: hidden;
                `;

                const caseNumber = escapeHtml(
                    data.case_number || "Unavailable"
                );

                const requestedAt = escapeHtml(
                    data.requested_at
                        ? formatDateTime(data.requested_at)
                        : "Not available"
                );

                const summary = escapeHtml(
                    data.closure_summary ||
                    "No closure summary available."
                );

                dialog.innerHTML = `
                    <div style="
                        display: flex;
                        flex-direction: column;
                        max-height: 85vh;
                    ">
                        <div style="
                            padding: 24px 28px 16px;
                            border-bottom: 1px solid #eee4fa;
                        ">
                            <h2 style="
                                margin: 0 0 6px;
                                font-size: 21px;
                                color: #24143d;
                            ">
                                Review Closure Request
                            </h2>
                            <p style="
                                margin: 0;
                                font-size: 13px;
                                color: #796b91;
                            ">
                                Review the Counselor's closure summary.
                            </p>
                        </div>

                        <div style="
                            padding: 22px 28px;
                            overflow-y: auto;
                        ">
                            <div style="
                                padding: 15px;
                                background: #faf7ff;
                                border: 1px solid #eadbff;
                                border-radius: 10px;
                                margin-bottom: 20px;
                            ">
                                <p style="margin: 0 0 10px;">
                                    <strong>Case Number:</strong>
                                    ${caseNumber}
                                </p>
                                <p style="margin: 0;">
                                    <strong>Requested At:</strong>
                                    ${requestedAt}
                                </p>
                            </div>

                            <h3 style="
                                margin: 0 0 10px;
                                font-size: 14px;
                                color: #48216f;
                            ">
                                Counselor's Closure Summary
                            </h3>

                            <div style="
                                padding: 16px;
                                border: 1px solid #eadbff;
                                border-radius: 10px;
                                line-height: 1.7;
                                font-size: 14px;
                                white-space: pre-wrap;
                                overflow-wrap: anywhere;
                            ">${summary}</div>
                        </div>

                        <div style="
                            display: flex;
                            justify-content: flex-end;
                            padding: 16px 28px;
                            border-top: 1px solid #eee4fa;
                        ">
                            <button
                                type="button"
                                id="closeClosureReview"
                                style="
                                    padding: 11px 24px;
                                    background: #873ef0;
                                    color: white;
                                    border: none;
                                    border-radius: 9px;
                                    font-weight: 600;
                                    cursor: pointer;
                                "
                            >
                                Close Review
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(dialog);

                let finished = false;

                function closeDialog() {
                    if (finished) return;
                    finished = true;
                    dialog.close();
                    dialog.remove();
                    resolve();
                }

                dialog.querySelector("#closeClosureReview")
                    .addEventListener("click", closeDialog);

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    closeDialog();
                });

                dialog.showModal();
            });
        }
        
        function bindViewClosureRequestButtons() {
            document
                .querySelectorAll(".view-closure-request-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "head_counselor") {
                            return;
                        }

                        const caseId = button.dataset.caseId;
                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Loading...";

                        try {
                            const data = await apiRequest(
                                `/cases/${caseId}/closure-review`
                            );

                            await showClosureReviewDialog(data);

                        } catch (error) {
                            console.error(
                                "Unable to load closure request:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to retrieve the closure request.",
                                "error"
                            );

                        } finally {
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
        }
        
        function showRevisionFeedbackDialog(data) {
            return new Promise(resolve => {
                const dialog = document.createElement("dialog");

                dialog.style.cssText = `
                    box-sizing: border-box;
                    width: min(600px, calc(100% - 32px));
                    max-height: 85vh;
                    margin: auto;
                    position: fixed;
                    inset: 0;
                    padding: 28px;
                    border: 1px solid #eadbff;
                    border-radius: 18px;
                    background: white;
                    color: #24143d;
                    box-shadow: 0 20px 60px rgba(32, 16, 70, 0.25);
                    font-family: inherit;
                    overflow-y: auto;
                `;

                dialog.innerHTML = `
                    <h2 style="margin: 0 0 8px; font-size: 22px;">
                        Revision Feedback
                    </h2>

                    <p style="
                        color: #796b91;
                        font-size: 14px;
                        line-height: 1.5;
                        margin: 0 0 20px;
                    ">
                        Review the Head Counselor's feedback before
                        resubmitting the case for closure.
                    </p>

                    <div style="
                        background: #faf7ff;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        padding: 15px;
                        margin-bottom: 18px;
                        font-size: 14px;
                    ">
                        <p style="margin: 0 0 10px;">
                            <strong>Case Number:</strong>
                            <span id="revisionFeedbackCase"></span>
                        </p>

                        <p style="margin: 0;">
                            <strong>Reviewed At:</strong>
                            <span id="revisionFeedbackDate"></span>
                        </p>
                    </div>

                    <h3 style="
                        margin: 0 0 10px;
                        font-size: 14px;
                        color: #48216f;
                    ">
                        Head Counselor's Remarks
                    </h3>

                    <div id="revisionFeedbackText" style="
                        padding: 16px;
                        border: 1px solid #eadbff;
                        border-radius: 10px;
                        font-size: 14px;
                        line-height: 1.7;
                        white-space: pre-wrap;
                        overflow-wrap: anywhere;
                        max-height: 300px;
                        overflow-y: auto;
                    "></div>

                    <div style="
                        display: flex;
                        justify-content: flex-end;
                        margin-top: 22px;
                    ">
                        <button
                            type="button"
                            id="closeRevisionFeedback"
                            class="btn btn-primary"
                        >
                            Close
                        </button>
                    </div>
                `;

                dialog.querySelector("#revisionFeedbackCase")
                    .textContent = data.case_number || "Unavailable";

                dialog.querySelector("#revisionFeedbackDate")
                    .textContent = data.reviewed_at
                        ? formatDateTime(data.reviewed_at)
                        : "Not available";

                dialog.querySelector("#revisionFeedbackText")
                    .textContent = data.remarks ||
                        "No revision remarks were provided.";

                document.body.appendChild(dialog);

                function closeDialog() {
                    dialog.close();
                    dialog.remove();
                    resolve();
                }

                dialog.querySelector("#closeRevisionFeedback")
                    .addEventListener("click", closeDialog);

                dialog.addEventListener("cancel", event => {
                    event.preventDefault();
                    closeDialog();
                });

                dialog.showModal();
            });
        }

        function bindRevisionFeedbackButtons() {
            document
                .querySelectorAll(".view-revision-feedback-button")
                .forEach(button => {
                    button.addEventListener("click", async () => {
                        if (currentRole !== "counselor") {
                            return;
                        }

                        const caseId = button.dataset.caseId;
                        const originalText = button.textContent.trim();

                        button.disabled = true;
                        button.textContent = "Loading...";

                        try {
                            const data = await apiRequest(
                                `/cases/${caseId}/revision-feedback`
                            );

                            await showRevisionFeedbackDialog(data);

                            const reviewedAt = data.reviewed_at
                                ? formatDateTime(data.reviewed_at)
                                : "Not available";

                            window.alert(
                                `REVISION FEEDBACK\n\n` +
                                `Case Number: ${data.case_number}\n` +
                                `Reviewed At: ${reviewedAt}\n\n` +
                                `HEAD COUNSELOR'S REMARKS:\n\n` +
                                remarks
                            );

                        } catch (error) {
                            console.error(
                                "Unable to load revision feedback:",
                                error
                            );

                            showMessage(
                                error?.data?.message ||
                                error?.data?.error ||
                                "Unable to retrieve revision feedback.",
                                "error"
                            );

                        } finally {
                            button.disabled = false;
                            button.textContent = originalText;
                        }
                    });
                });
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
