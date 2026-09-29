document.addEventListener(
    "DOMContentLoaded",
    async () => {


        // =====================================================
        // AUTHENTICATION
        // =====================================================

        if (!requireLogin()) {
            return;
        }



        // =====================================================
        // DOM ELEMENTS
        // =====================================================

        const messageBox =
            document.getElementById(
                "clearanceMessage"
            );


        const pageTitle =
            document.getElementById(
                "clearancePageTitle"
            );


        const pageSubtitle =
            document.getElementById(
                "clearancePageSubtitle"
            );


        const studentSection =
            document.getElementById(
                "studentClearanceSection"
            );


        const evaluationSection =
            document.getElementById(
                "evaluationSection"
            );


        const studentContainer =
            document.getElementById(
                "clearanceContainer"
            );


        const evaluationContainer =
            document.getElementById(
                "clearanceEvaluationContainer"
            );


        const statusFilter =
            document.getElementById(
                "clearanceStatusFilter"
            );


        const searchInput =
            document.getElementById(
                "clearanceSearch"
            );


        const refreshButton =
            document.getElementById(
                "refreshClearancesButton"
            );



        // =====================================================
        // STATE
        // =====================================================

        let currentUser =
            null;

        let profile =
            null;

        let clearanceRecords =
            [];



        // =====================================================
        // LOAD ACCOUNT
        // =====================================================

        try {

            const account =
                await apiRequest(
                    "/auth/me"
                );


            currentUser =
                account.user ||
                account;


            profile =
                account.profile ||
                null;


        } catch (error) {

            showMessage(
                "Unable to load your account.",
                "error"
            );


            return;

        }



        // =====================================================
        // SHARED SIDEBAR
        // =====================================================

        const currentRole =
            String(
                currentUser.role || ""
            ).toLowerCase();


        setupRoleNavigation(
            currentRole
        );



        // =====================================================
        // ROLE ROUTING
        // =====================================================

        if (
            currentRole ===
            "student"
        ) {

            studentSection.hidden =
                false;


            evaluationSection.hidden =
                true;


            pageTitle.textContent =
                "Student Exit Clearance";


            pageSubtitle.textContent =
                "View your guidance and counseling clearance status.";


            await loadStudentClearance();


        } else if (
            currentRole === "staff" ||
            currentRole === "admin" ||
            currentRole === "head_counselor"
        ) {

            studentSection.hidden =
                true;


            evaluationSection.hidden =
                false;


            pageTitle.textContent =
                "Clearance Evaluation";


            pageSubtitle.textContent =
                "Review graduating student clearance requirements and approve eligible records.";


            await loadClearanceRecords();


        } else {

            studentSection.hidden =
                true;


            evaluationSection.hidden =
                true;


            showMessage(
                "You do not have permission to access clearance evaluation.",
                "error"
            );

        }



        // =====================================================
        // STUDENT - LOAD OWN CLEARANCE
        // =====================================================

        async function loadStudentClearance() {

            try {

                const data =
                    await apiRequest(
                        "/clearances/me"
                    );


                const clearances =
                    data.items ||
                    [];


                if (
                    clearances.length === 0
                ) {

                    renderNoClearance();

                    return;

                }


                const clearance =
                    clearances[0];


                renderStudentClearance(
                    clearance
                );


            } catch (error) {

                console.error(
                    "Unable to load clearance:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    "Unable to load clearance status.",
                    "error"
                );

            }

        }



        // =====================================================
        // STUDENT - RENDER CLEARANCE
        // =====================================================

        function renderStudentClearance(
            clearance
        ) {

            const status =
                clearance.status ||
                "NOT_CLEARED";


            const exitCompleted =
                clearance.exit_questionnaire_completed ===
                true;


            const counselingCompleted =
                clearance.counseling_requirements_completed ===
                true;


            const interviewCompleted =
                clearance.exit_interview_completed ===
                true;


            studentContainer.innerHTML = `

                <div class="clearance-status-card">


                    <div class="clearance-main-status">

                        <span
                            class="
                                clearance-status-badge
                                ${
                                    status === "CLEARED"
                                        ? "cleared"
                                        : "not-cleared"
                                }
                            "
                        >

                            ${formatStatus(status)}

                        </span>


                        <h3>

                            ${
                                status === "CLEARED"
                                    ? "You are cleared."
                                    : "Your clearance is not yet complete."
                            }

                        </h3>


                        <p>

                            ${
                                status === "CLEARED"
                                    ? "All guidance and counseling clearance requirements have been completed."
                                    : "Complete the remaining requirements below."
                            }

                        </p>

                    </div>



                    <div class="clearance-requirements">

                        ${createRequirement(
                            "Exit Questionnaire",
                            exitCompleted,
                            "Complete the required graduating student exit questionnaire."
                        )}


                        ${createRequirement(
                            "Counseling Requirements",
                            counselingCompleted,
                            "All counseling cases and required follow-up activities must be completed."
                        )}


                        ${createRequirement(
                            "Exit Interview",
                            interviewCompleted,
                            "Complete the required exit interview with the Guidance and Counseling Office."
                        )}

                    </div>



                    ${
                        clearance.academic_year
                            ? `

                                <div class="clearance-info-row">

                                    <span>
                                        Academic Year
                                    </span>

                                    <strong>
                                        ${escapeHtml(
                                            clearance.academic_year
                                        )}
                                    </strong>

                                </div>

                            `
                            : ""
                    }



                    ${
                        clearance.certificate_number
                            ? `

                                <div class="clearance-info-row">

                                    <span>
                                        Certificate Number
                                    </span>

                                    <strong>
                                        ${escapeHtml(
                                            clearance.certificate_number
                                        )}
                                    </strong>

                                </div>

                            `
                            : ""
                    }



                    ${
                        clearance.remarks
                            ? `

                                <div class="clearance-remarks">

                                    <strong>
                                        Remarks
                                    </strong>

                                    <p>
                                        ${escapeHtml(
                                            clearance.remarks
                                        )}
                                    </p>

                                </div>

                            `
                            : ""
                    }



                    ${
                        status === "CLEARED"
                            ? `

                                <div class="clearance-actions">

                                    <button
                                        type="button"
                                        id="printClearanceButton"
                                        class="primary-button"
                                    >
                                        Print Clearance Certificate
                                    </button>

                                </div>

                            `
                            : ""
                    }


                </div>

            `;



            const printButton =
                document.getElementById(
                    "printClearanceButton"
                );


            if (printButton) {

                printButton.addEventListener(
                    "click",
                    async () => {

                        await printClearanceCertificate(
                            clearance.id
                        );

                    }
                );

            }

        }



        // =====================================================
        // STAFF / ADMIN / HEAD COUNSELOR
        // LOAD ALL CLEARANCES
        // =====================================================

        async function loadClearanceRecords() {

            try {

                evaluationContainer.innerHTML = `

                    <p>
                        Loading clearance records...
                    </p>

                `;


                const data =
                    await apiRequest(
                        "/clearances"
                    );


                clearanceRecords =
                    data.items ||
                    [];


                renderClearanceRecords();


            } catch (error) {

                console.error(
                    "Unable to load clearance records:",
                    error
                );


                evaluationContainer.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            Unable to Load Records
                        </h3>

                        <p>
                            ${escapeHtml(
                                error?.data?.message ||
                                "The clearance records could not be loaded."
                            )}
                        </p>

                    </div>

                `;

            }

        }



        // =====================================================
        // RENDER EVALUATION LIST
        // =====================================================

        function renderClearanceRecords() {

            const selectedStatus =
                statusFilter?.value ||
                "";


            const searchTerm =
                (
                    searchInput?.value ||
                    ""
                )
                    .trim()
                    .toLowerCase();


            const filtered =
                clearanceRecords.filter(
                    clearance => {


                        if (
                            selectedStatus &&
                            clearance.status !==
                            selectedStatus
                        ) {

                            return false;

                        }


                        if (searchTerm) {

                            const student =
                                clearance.student ||
                                {};


                            const searchText =
                                [
                                    student.student_number,
                                    student.first_name,
                                    student.last_name,
                                    student.full_name,
                                    student.program,
                                    clearance.academic_year
                                ]
                                    .filter(Boolean)
                                    .join(" ")
                                    .toLowerCase();


                            if (
                                !searchText.includes(
                                    searchTerm
                                )
                            ) {

                                return false;

                            }

                        }


                        return true;

                    }
                );


            if (
                filtered.length === 0
            ) {

                evaluationContainer.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            No Clearance Records
                        </h3>

                        <p>
                            No records match the selected filters.
                        </p>

                    </div>

                `;


                return;

            }


            evaluationContainer.innerHTML =
                filtered
                    .map(
                        clearance =>
                            createEvaluationCard(
                                clearance
                            )
                    )
                    .join("");


            bindEvaluationEvents();

        }



        // =====================================================
        // EVALUATION CARD
        // =====================================================

        function createEvaluationCard(
            clearance
        ) {

            const student =
                clearance.student ||
                {};


            const exitCompleted =
                clearance.exit_questionnaire_completed ===
                true;


            const counselingCompleted =
                clearance.counseling_requirements_completed ===
                true;


            const interviewCompleted =
                clearance.exit_interview_completed ===
                true;


            const allRequirementsComplete =
                exitCompleted &&
                counselingCompleted &&
                interviewCompleted;


            return `

                <div
                    class="clearance-evaluation-card"
                    data-clearance-id="${clearance.id}"
                >


                    <div class="clearance-evaluation-header">

                        <div>

                            <h3>
                                ${escapeHtml(
                                    student.full_name ||
                                    "Student"
                                )}
                            </h3>

                            <p>

                                ${
                                    student.student_number
                                        ? escapeHtml(
                                            student.student_number
                                        )
                                        : "No student number"
                                }

                                ${
                                    student.program
                                        ? ` • ${escapeHtml(
                                            student.program
                                        )}`
                                        : ""
                                }

                            </p>

                        </div>


                        <span
                            class="
                                clearance-status-badge
                                ${
                                    clearance.status === "CLEARED"
                                        ? "cleared"
                                        : "not-cleared"
                                }
                            "
                        >

                            ${formatStatus(
                                clearance.status
                            )}

                        </span>

                    </div>



                    <div class="clearance-evaluation-details">

                        <div>

                            <span>
                                Academic Year
                            </span>

                            <strong>
                                ${escapeHtml(
                                    clearance.academic_year ||
                                    "-"
                                )}
                            </strong>

                        </div>


                        ${
                            student.year_level
                                ? `

                                    <div>

                                        <span>
                                            Year Level
                                        </span>

                                        <strong>
                                            ${escapeHtml(
                                                student.year_level
                                            )}
                                        </strong>

                                    </div>

                                `
                                : ""
                        }

                    </div>



                    <div class="clearance-requirements">

                        ${createRequirement(
                            "Exit Questionnaire",
                            exitCompleted,
                            "Automatically checked from the student's submitted exit questionnaire."
                        )}


                        ${createRequirement(
                            "Counseling Requirements",
                            counselingCompleted,
                            "Automatically checked based on open counseling cases."
                        )}


                        ${createRequirement(
                            "Exit Interview",
                            interviewCompleted,
                            "Confirmed manually by authorized guidance personnel."
                        )}

                    </div>



                    ${
                        clearance.status !== "CLEARED"
                            ? `

                                <div class="clearance-evaluation-form">


                                    <label
                                        class="clearance-interview-check"
                                    >

                                        <input
                                            type="checkbox"
                                            class="exit-interview-checkbox"
                                            data-clearance-id="${clearance.id}"
                                            ${
                                                interviewCompleted
                                                    ? "checked"
                                                    : ""
                                            }
                                        >

                                        <span>
                                            Confirm Exit Interview Completed
                                        </span>

                                    </label>



                                    <div class="form-group">

                                        <label
                                            for="remarks-${clearance.id}"
                                        >
                                            Remarks
                                        </label>

                                        <textarea
                                            id="remarks-${clearance.id}"
                                            class="clearance-remarks-input"
                                            data-clearance-id="${clearance.id}"
                                            rows="3"
                                            placeholder="Optional remarks..."
                                        >${escapeHtml(
                                            clearance.remarks ||
                                            ""
                                        )}</textarea>

                                    </div>



                                    <div class="clearance-evaluation-actions">

                                        <button
                                            type="button"
                                            class="secondary-button save-clearance-button"
                                            data-clearance-id="${clearance.id}"
                                        >
                                            Save Evaluation
                                        </button>


                                        <button
                                            type="button"
                                            class="primary-button approve-clearance-button"
                                            data-clearance-id="${clearance.id}"
                                            ${
                                                allRequirementsComplete
                                                    ? ""
                                                    : "disabled"
                                            }
                                        >
                                            Approve Clearance
                                        </button>

                                    </div>


                                </div>

                            `
                            : `

                                <div class="clearance-approved-panel">

                                    <strong>
                                        Clearance Approved
                                    </strong>


                                    ${
                                        clearance.certificate_number
                                            ? `

                                                <p>
                                                    Certificate:
                                                    ${escapeHtml(
                                                        clearance.certificate_number
                                                    )}
                                                </p>

                                            `
                                            : ""
                                    }


                                    <button
                                        type="button"
                                        class="secondary-button print-clearance-button"
                                        data-clearance-id="${clearance.id}"
                                    >
                                        Print Certificate
                                    </button>

                                </div>

                            `
                    }


                </div>

            `;

        }



        // =====================================================
        // BIND EVALUATION EVENTS
        // =====================================================

        function bindEvaluationEvents() {


            document
                .querySelectorAll(
                    ".save-clearance-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const clearanceId =
                                    Number(
                                        button.dataset.clearanceId
                                    );


                                await evaluateClearance(
                                    clearanceId,
                                    false
                                );

                            }
                        );

                    }
                );



            document
                .querySelectorAll(
                    ".approve-clearance-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const clearanceId =
                                    Number(
                                        button.dataset.clearanceId
                                    );


                                await evaluateClearance(
                                    clearanceId,
                                    true
                                );

                            }
                        );

                    }
                );



            document
                .querySelectorAll(
                    ".exit-interview-checkbox"
                )
                .forEach(
                    checkbox => {

                        checkbox.addEventListener(
                            "change",
                            () => {

                                const clearanceId =
                                    checkbox.dataset.clearanceId;


                                const card =
                                    document.querySelector(
                                        `[data-clearance-id="${clearanceId}"]`
                                    );


                                const approveButton =
                                    card?.querySelector(
                                        ".approve-clearance-button"
                                    );


                                const record =
                                    clearanceRecords.find(
                                        item =>
                                            String(item.id) ===
                                            String(clearanceId)
                                    );


                                if (
                                    !approveButton ||
                                    !record
                                ) {

                                    return;

                                }


                                const canApprove =
                                    record.exit_questionnaire_completed ===
                                    true &&
                                    record.counseling_requirements_completed ===
                                    true &&
                                    checkbox.checked;


                                approveButton.disabled =
                                    !canApprove;

                            }
                        );

                    }
                );



            document
                .querySelectorAll(
                    ".print-clearance-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const clearanceId =
                                    button.dataset.clearanceId;


                                await printClearanceCertificate(
                                    clearanceId
                                );

                            }
                        );

                    }
                );

        }



        // =====================================================
        // SAVE / APPROVE CLEARANCE
        // =====================================================

        async function evaluateClearance(
            clearanceId,
            approve
        ) {

            const card =
                document.querySelector(
                    `.clearance-evaluation-card[data-clearance-id="${clearanceId}"]`
                );


            if (!card) {
                return;
            }


            const interviewCheckbox =
                card.querySelector(
                    ".exit-interview-checkbox"
                );


            const remarksInput =
                card.querySelector(
                    ".clearance-remarks-input"
                );


            const payload = {

                exit_interview_completed:
                    interviewCheckbox?.checked ===
                    true,

                remarks:
                    remarksInput?.value?.trim() ||
                    "",

                approve:
                    approve

            };


            try {

                await apiRequest(
                    `/clearances/${clearanceId}/evaluate`,
                    {
                        method:
                            "PATCH",

                        body:
                            JSON.stringify(
                                payload
                            )
                    }
                );


                showMessage(
                    approve
                        ? "Clearance approved successfully."
                        : "Clearance evaluation saved.",
                    "success"
                );


                await loadClearanceRecords();


            } catch (error) {

                console.error(
                    "Unable to evaluate clearance:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    "Unable to update clearance.",
                    "error"
                );

            }

        }



        // =====================================================
        // REQUIREMENT COMPONENT
        // =====================================================

        function createRequirement(
            title,
            completed,
            description
        ) {

            return `

                <div class="clearance-requirement">

                    <div
                        class="
                            requirement-icon
                            ${
                                completed
                                    ? "complete"
                                    : "pending"
                            }
                        "
                    >

                        ${
                            completed
                                ? "✓"
                                : "!"
                        }

                    </div>


                    <div>

                        <strong>
                            ${escapeHtml(title)}
                        </strong>


                        <span
                            class="requirement-status"
                        >

                            ${
                                completed
                                    ? "Completed"
                                    : "Pending"
                            }

                        </span>


                        <p>
                            ${escapeHtml(description)}
                        </p>

                    </div>

                </div>

            `;

        }



        // =====================================================
        // NO STUDENT CLEARANCE
        // =====================================================

        function renderNoClearance() {

            studentContainer.innerHTML = `

                <div class="empty-state">

                    <h3>
                        No Clearance Record
                    </h3>

                    <p>
                        Submit your exit clearance request for evaluation.
                    </p>


                    <div class="form-group clearance-request-field">

                        <label for="clearanceAcademicYear">
                            Academic Year
                        </label>

                        <input
                            type="text"
                            id="clearanceAcademicYear"
                            placeholder="e.g. 2026-2027"
                            value="2026-2027"
                        >

                    </div>


                    <button
                        type="button"
                        id="requestClearanceButton"
                        class="primary-button"
                    >
                        Request Exit Clearance
                    </button>

                </div>

            `;


            const requestButton =
                document.getElementById(
                    "requestClearanceButton"
                );


            requestButton?.addEventListener(
                "click",
                requestStudentClearance
            );

        }



        // =====================================================
        // STUDENT - REQUEST EXIT CLEARANCE
        // =====================================================

        async function requestStudentClearance() {

            const academicYearInput =
                document.getElementById(
                    "clearanceAcademicYear"
                );


            const requestButton =
                document.getElementById(
                    "requestClearanceButton"
                );


            const academicYear =
                academicYearInput?.value?.trim() ||
                "";


            if (!academicYear) {

                showMessage(
                    "Please enter the academic year.",
                    "error"
                );


                academicYearInput?.focus();


                return;

            }


            try {

                requestButton.disabled =
                    true;


                requestButton.textContent =
                    "Submitting Request...";


                await apiRequest(
                    "/clearances",
                    {
                        method:
                            "POST",

                        body:
                            JSON.stringify({
                                academic_year:
                                    academicYear
                            })
                    }
                );


                showMessage(
                    "Exit clearance request submitted successfully.",
                    "success"
                );


                await loadStudentClearance();


            } catch (error) {

                console.error(
                    "Unable to request clearance:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    "Unable to submit your clearance request.",
                    "error"
                );


                requestButton.disabled =
                    false;


                requestButton.textContent =
                    "Request Exit Clearance";

            }

        }



        // =====================================================
        // FILTER EVENTS
        // =====================================================

        if (statusFilter) {

            statusFilter.addEventListener(
                "change",
                renderClearanceRecords
            );

        }


        if (searchInput) {

            searchInput.addEventListener(
                "input",
                renderClearanceRecords
            );

        }


        if (refreshButton) {

            refreshButton.addEventListener(
                "click",
                loadClearanceRecords
            );

        }



        // =====================================================
        // PRINT CLEARANCE CERTIFICATE
        // =====================================================

        async function printClearanceCertificate(
            clearanceId
        ) {

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
                    `/reports/clearances/${clearanceId}/certificate.pdf`
                );
                if (!response) {
                    return;
                }


                if (!response.ok) {

                    let message =
                        "Unable to open the clearance certificate.";


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
                        "The certificate was opened but the browser blocked the new tab. Please allow pop-ups for this site.",
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
                    "Unable to print clearance certificate:",
                    error
                );


                showMessage(
                    error?.message ||
                    "Unable to open the clearance certificate.",
                    "error"
                );

            }

        }



        // =====================================================
        // SIDEBAR NAVIGATION
        // =====================================================

        const dashboardNav =
            document.getElementById(
                "dashboardNav"
            );


        const appointmentsNav =
            document.getElementById(
                "appointmentsNav"
            );


        const casesNav =
            document.getElementById(
                "casesNav"
            );


        const referralsNav =
            document.getElementById(
                "referralsNav"
            );


        const exitNav =
            document.getElementById(
                "exitNav"
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



        if (casesNav) {

            casesNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/cases";

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



        /*
         * Clearance is the current page,
         * so clearanceNav does not need
         * a click handler.
         */



        if (adminNav) {

            adminNav.addEventListener(
                "click",
                () => {

                    if (
                        currentRole ===
                        "admin"
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



        // =====================================================
        // LOGOUT
        // =====================================================

        if (logoutButton) {

            logoutButton.addEventListener(
                "click",
                async () => {

                    try {

                        await apiRequest(
                            "/auth/logout",
                            {
                                method:
                                    "POST"
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



        // =====================================================
        // HELPERS
        // =====================================================

        function formatStatus(
            status
        ) {

            return String(
                status ||
                ""
            )
                .replaceAll(
                    "_",
                    " "
                );

        }



        function showMessage(
            message,
            type
        ) {

            if (!messageBox) {
                return;
            }


            messageBox.textContent =
                message;


            messageBox.className =
                `message ${type}`;

        }



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


    }
);
