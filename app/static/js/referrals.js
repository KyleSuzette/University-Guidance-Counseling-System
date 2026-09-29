document.addEventListener(
    "DOMContentLoaded",
    () => {

        // =================================================
        // CURRENT USER / ROLE
        // =================================================

        const currentUser =
            JSON.parse(
                localStorage.getItem("user") || "{}"
            );

        const userRole =
            String(
                currentUser.role || ""
            ).toLowerCase();

        const isHeadCounselor =
            userRole === "head_counselor";

        // =================================================
        // SHARED SIDEBAR
        // =================================================

        setupRoleNavigation(
            userRole
        );

        // =================================================
        // DOM ELEMENTS
        // =================================================

        const managementSection =
            document.getElementById(
                "referralManagementSection"
            );

        const publicReferralSection =
            document.getElementById(
                "publicReferralSection"
            );

        const referralQueue =
            document.getElementById(
                "referralQueue"
            );

        const managementStatusFilter =
            document.getElementById(
                "managementStatusFilter"
            );

        const referralForm =
            document.getElementById(
                "referralForm"
            );

        const trackingForm =
            document.getElementById(
                "trackingForm"
            );

        const messageBox =
            document.getElementById(
                "referralMessage"
            );

        const trackingResult =
            document.getElementById(
                "trackingResult"
            );

        const submitButton =
            document.getElementById(
                "submitReferralButton"
            );

        const referralPageTitle =
            document.getElementById(
                "referralPageTitle"
            );

        const referralPageDescription =
            document.getElementById(
                "referralPageDescription"
            );


        // =================================================
        // ROLE-BASED REFERRAL VIEW
        // =================================================

        if (isHeadCounselor) {

            if (managementSection) {
                managementSection.classList.remove(
                    "hidden"
                );
            }

            if (publicReferralSection) {
                publicReferralSection.classList.add(
                    "hidden"
                );
            }

            if (referralPageTitle) {
                referralPageTitle.textContent =
                    "Referral Intake & Triage";
            }

            if (referralPageDescription) {
                referralPageDescription.textContent =
                    "Review submitted concerns and coordinate appropriate guidance services.";
            }

        } else {

            if (managementSection) {
                managementSection.classList.add(
                    "hidden"
                );
            }

            if (publicReferralSection) {
                publicReferralSection.classList.remove(
                    "hidden"
                );
            }

        }


        // =================================================
        // SUBMIT ANONYMOUS REFERRAL
        // =================================================

        if (referralForm) {

            referralForm.addEventListener(
                "submit",
                async event => {

                    event.preventDefault();

                    hideMessage();


                    const subjectName =
                        document
                            .getElementById(
                                "subjectName"
                            )
                            .value
                            .trim();


                    const studentId =
                        document
                            .getElementById(
                                "subjectStudentId"
                            )
                            .value;


                    const programYear =
                        document
                            .getElementById(
                                "programYear"
                            )
                            .value
                            .trim();


                    const concernCategory =
                        document
                            .getElementById(
                                "concernCategory"
                            )
                            .value;


                    const concernDetails =
                        document
                            .getElementById(
                                "concernDetails"
                            )
                            .value
                            .trim();


                    const observedAt =
                        document
                            .getElementById(
                                "observedAt"
                            )
                            .value;


                    if (
                        concernDetails.length < 20
                    ) {

                        showMessage(
                            "Concern details must contain at least 20 characters.",
                            "error"
                        );

                        return;
                    }


                    const payload = {

                        subject_name:
                            subjectName,

                        concern_category:
                            concernCategory,

                        concern_details:
                            concernDetails

                    };


                    if (studentId) {

                        payload.subject_student_id =
                            Number(studentId);

                    }


                    if (programYear) {

                        payload.subject_program_year =
                            programYear;

                    }


                    if (observedAt) {

                        payload.observed_at =
                            new Date(
                                observedAt
                            ).toISOString();

                    }


                    submitButton.disabled =
                        true;

                    submitButton.textContent =
                        "Submitting...";


                    try {

                        const data =
                            await apiRequest(
                                "/referrals/anonymous",
                                {
                                    method: "POST",

                                    body:
                                        JSON.stringify(
                                            payload
                                        )
                                }
                            );


                        referralForm.reset();


                        showMessage(
                            "Referral submitted successfully.",
                            "success"
                        );


                        trackingResult.innerHTML = `

                            <h3>
                                Referral Submitted
                            </h3>

                            <p>
                                Save this tracking code:
                            </p>

                            <div class="tracking-code">
                                ${escapeHtml(
                                    data.tracking_code
                                )}
                            </div>

                            <p>
                                Current Status:
                                <strong>
                                    ${escapeHtml(
                                        data.status || "NEW"
                                    )}
                                </strong>
                            </p>

                        `;


                        trackingResult.classList.remove(
                            "hidden"
                        );


                        document
                            .getElementById(
                                "trackingCode"
                            )
                            .value =
                            data.tracking_code;


                    } catch (error) {

                        console.error(
                            "Referral submission error:",
                            error
                        );


                        const message =
                            error?.data?.message ||
                            error?.data?.error ||
                            "Unable to submit the referral.";


                        showMessage(
                            message,
                            "error"
                        );


                    } finally {

                        submitButton.disabled =
                            false;

                        submitButton.textContent =
                            "Submit Anonymous Referral";

                    }

                }
            );

        }


        // =================================================
        // CHECK TRACKING STATUS
        // =================================================

        if (trackingForm) {

            trackingForm.addEventListener(
                "submit",
                async event => {

                    event.preventDefault();


                    const trackingCode =
                        document
                            .getElementById(
                                "trackingCode"
                            )
                            .value
                            .trim();


                    if (!trackingCode) {
                        return;
                    }


                    trackingResult.innerHTML =
                        "Checking status...";


                    trackingResult.classList.remove(
                        "hidden"
                    );


                    try {

                        const data =
                            await apiRequest(
                                `/referrals/status/${encodeURIComponent(
                                    trackingCode
                                )}`
                            );


                        trackingResult.innerHTML = `

                            <h3>
                                Referral Status
                            </h3>

                            <div class="tracking-status-row">

                                <span>
                                    Tracking Code
                                </span>

                                <strong>
                                    ${escapeHtml(
                                        trackingCode
                                    )}
                                </strong>

                            </div>

                            <div class="tracking-status-row">

                                <span>
                                    Status
                                </span>

                                <strong class="referral-status">
                                    ${escapeHtml(
                                        data.status
                                    )}
                                </strong>

                            </div>

                        `;


                    } catch (error) {

                        console.error(
                            "Tracking lookup error:",
                            error
                        );


                        trackingResult.innerHTML = `

                            <div class="message error">

                                ${
                                    escapeHtml(
                                        error?.data?.message ||
                                        "Referral tracking code was not found."
                                    )
                                }

                            </div>

                        `;

                    }

                }
            );

        }


        // =================================================
        // HEAD COUNSELOR - LOAD REFERRAL QUEUE
        // =================================================

        async function loadReferralQueue() {

            if (!isHeadCounselor) {
                return;
            }


            referralQueue.innerHTML =
                "<p>Loading referrals...</p>";


            let endpoint =
                "/referrals";


            if (
                managementStatusFilter &&
                managementStatusFilter.value
            ) {

                endpoint +=
                    `?status=${encodeURIComponent(
                        managementStatusFilter.value
                    )}`;

            }


            try {

                const data =
                    await apiRequest(
                        endpoint
                    );


                const referrals =
                    data.items ||
                    data.referrals ||
                    [];


                renderReferralQueue(
                    referrals
                );


            } catch (error) {

                console.error(
                    "Unable to load referral queue:",
                    error
                );


                referralQueue.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            Unable to load referrals
                        </h3>

                        <p>
                            ${
                                escapeHtml(
                                    error?.data?.message ||
                                    "The referral queue could not be loaded."
                                )
                            }
                        </p>

                    </div>

                `;

            }

        }


        // =================================================
        // STATUS FILTER
        // =================================================

        if (managementStatusFilter) {

            managementStatusFilter.addEventListener(
                "change",
                loadReferralQueue
            );

        }


        // =================================================
        // RENDER REFERRAL QUEUE
        // =================================================

        function renderReferralQueue(
            referrals
        ) {

            if (!referrals.length) {

                referralQueue.innerHTML = `

                    <div class="empty-state">

                        <h3>
                            No referrals found
                        </h3>

                        <p>
                            There are currently no referrals
                            matching this status.
                        </p>

                    </div>

                `;

                return;
            }


            referralQueue.innerHTML =
                referrals.map(
                    referral => {

                        return `

                            <article class="referral-management-card">

                                <div class="referral-card-header">

                                    <div>

                                        <span class="referral-tracking-code">

                                            ${escapeHtml(
                                                referral.tracking_code
                                            )}

                                        </span>

                                    </div>


                                    <span
                                        class="
                                            referral-status-badge
                                            status-${String(
                                                referral.status
                                            ).toLowerCase()}
                                        "
                                    >

                                        ${formatReferralStatus(
                                            referral.status
                                        )}

                                    </span>

                                </div>


                                <div class="referral-information">


                                    <div class="referral-info-row">

                                        <span class="referral-info-label">
                                            Student Name:
                                        </span>

                                        <strong>
                                            ${escapeHtml(
                                                referral.subject_name
                                            )}
                                        </strong>

                                    </div>


                                    <div class="referral-info-row">

                                        <span class="referral-info-label">
                                            Concern Category:
                                        </span>

                                        <strong>
                                            ${escapeHtml(
                                                referral.concern_category
                                            )}
                                        </strong>

                                    </div>


                                    <div class="referral-info-row">

                                        <span class="referral-info-label">
                                            Triage Priority:
                                        </span>

                                        <strong>

                                            ${
                                                referral.status === "NEW"
                                                    ? "Pending Assessment"
                                                    : escapeHtml(
                                                        referral.priority ||
                                                        "Not specified"
                                                    )
                                            }

                                        </strong>

                                    </div>


                                    <div class="referral-info-row">

                                        <span class="referral-info-label">
                                            Referral Status:
                                        </span>

                                        <strong>
                                            ${formatReferralStatus(
                                                referral.status
                                            )}
                                        </strong>

                                    </div>


                                    ${
                                        referral.assigned_counselor_id
                                            ? `
                                                <div class="referral-info-row">

                                                    <span class="referral-info-label">
                                                        Assigned Counselor:
                                                    </span>

                                                    <strong>
                                                        Counselor #${escapeHtml(
                                                            referral.assigned_counselor_id
                                                        )}
                                                    </strong>

                                                </div>
                                            `
                                            : ""
                                    }


                                </div>


                                <div class="referral-reported-concern">

                                    <strong>
                                        Reported Concern:
                                    </strong>

                                    <p>
                                        ${escapeHtml(
                                            referral.concern_details
                                        )}
                                    </p>

                                </div>


                                ${
                                    referral.status === "NEW"

                                        ? `

                                            <div class="referral-actions">

                                                <button
                                                    type="button"
                                                    class="btn btn-primary review-referral-button"
                                                    data-id="${referral.id}"
                                                >
                                                    Review Referral
                                                </button>

                                            </div>


                                            <div
                                                id="triageForm-${referral.id}"
                                                class="triage-form hidden"
                                            >

                                                <h4>
                                                    Triage Assessment
                                                </h4>

                                                <p class="form-help">
                                                    Record the priority level determined
                                                    during review of this referral.
                                                </p>


                                                <div class="form-group">

                                                    <label
                                                        for="triagePriority-${referral.id}"
                                                    >
                                                        Triage Priority
                                                    </label>


                                                    <select
                                                        id="triagePriority-${referral.id}"
                                                    >

                                                        <option value="">
                                                            Select priority
                                                        </option>

                                                        <option value="LOW">
                                                            Low
                                                        </option>

                                                        <option value="MEDIUM">
                                                            Medium
                                                        </option>

                                                        <option value="HIGH">
                                                            High
                                                        </option>

                                                        <option value="URGENT">
                                                            Urgent
                                                        </option>

                                                    </select>

                                                </div>


                                                <div class="form-group">

                                                    <label
                                                        for="triageNotes-${referral.id}"
                                                    >

                                                        Triage Notes

                                                        <span class="optional-text">
                                                            (optional)
                                                        </span>

                                                    </label>


                                                    <textarea
                                                        id="triageNotes-${referral.id}"
                                                        rows="4"
                                                        placeholder="Enter relevant notes from the triage review."
                                                    ></textarea>

                                                </div>


                                                <div class="triage-form-actions">

                                                    <button
                                                        type="button"
                                                        class="btn btn-outline cancel-triage-button"
                                                        data-id="${referral.id}"
                                                    >
                                                        Cancel
                                                    </button>


                                                    <button
                                                        type="button"
                                                        class="btn btn-primary complete-triage-button"
                                                        data-id="${referral.id}"
                                                    >
                                                        Complete Triage
                                                    </button>

                                                </div>

                                            </div>

                                        `

                                        : ""
                                }


                                ${
                                    referral.status === "TRIAGED"

                                        ? `

                                            <div class="referral-actions">

                                                <button
                                                    type="button"
                                                    class="btn btn-primary assign-counselor-button"
                                                    data-id="${referral.id}"
                                                >
                                                    Assign Counselor
                                                </button>

                                            </div>


                                            <div
                                                id="assignmentForm-${referral.id}"
                                                class="assignment-form hidden"
                                            >

                                                <h4>
                                                    Counselor Assignment
                                                </h4>

                                                <p class="form-help">
                                                    Select the counselor who will handle this referral.
                                                </p>


                                                <div class="form-group">

                                                    <label
                                                        for="counselorSelect-${referral.id}"
                                                    >
                                                        Designated Counselor
                                                    </label>


                                                    <select
                                                        id="counselorSelect-${referral.id}"
                                                        class="counselor-select"
                                                    >

                                                        <option value="">
                                                            Select counselor
                                                        </option>

                                                    </select>

                                                </div>


                                                <div class="assignment-form-actions">

                                                    <button
                                                        type="button"
                                                        class="btn btn-outline cancel-assignment-button"
                                                        data-id="${referral.id}"
                                                    >
                                                        Cancel
                                                    </button>


                                                    <button
                                                        type="button"
                                                        class="btn btn-primary confirm-assignment-button"
                                                        data-id="${referral.id}"
                                                    >
                                                        Confirm Assignment
                                                    </button>

                                                </div>

                                            </div>

                                        `

                                        : ""
                                }
                                ${
                                    referral.status === "ASSIGNED"

                                        ? `

                                            <div class="case-initiation-section">

                                                <div class="case-initiation-header">

                                                    <h4>
                                                        Case Initiation
                                                    </h4>

                                                    <p class="form-help">
                                                        The referral has been assigned.
                                                        Create a counseling case to begin
                                                        the formal case lifecycle.
                                                    </p>

                                                </div>


                                                <div class="case-referral-summary">

                                                    <div class="referral-info-row">

                                                        <span class="referral-info-label">
                                                            Category:
                                                        </span>

                                                        <strong>
                                                            ${escapeHtml(
                                                                referral.concern_category
                                                            )}
                                                        </strong>

                                                    </div>


                                                    <div class="referral-info-row">

                                                        <span class="referral-info-label">
                                                            Priority:
                                                        </span>

                                                        <strong>
                                                            ${escapeHtml(
                                                                referral.priority || "MEDIUM"
                                                            )}
                                                        </strong>

                                                    </div>

                                                </div>


                                                <div class="form-group">

                                                    <label
                                                        for="caseStudent-${referral.id}"
                                                    >
                                                        Registered Student
                                                    </label>

                                                    <select
                                                        id="caseStudent-${referral.id}"
                                                        class="case-student-select"
                                                    >

                                                        <option value="">
                                                            Select registered student
                                                        </option>

                                                    </select>

                                                    <small class="form-help">
                                                        Select the student record associated
                                                        with this referral.
                                                    </small>

                                                </div>


                                                <div class="form-group">

                                                    <label
                                                        for="caseIntakeSummary-${referral.id}"
                                                    >
                                                        Intake Summary
                                                    </label>

                                                    <textarea
                                                        id="caseIntakeSummary-${referral.id}"
                                                        rows="4"
                                                        placeholder="Enter the initial case summary."
                                                    >${escapeHtml(
                                                        referral.concern_details || ""
                                                    )}</textarea>

                                                </div>


                                                <div class="case-initiation-actions">

                                                    <button
                                                        type="button"
                                                        class="btn btn-primary create-case-button"
                                                        data-id="${referral.id}"
                                                        data-counselor-id="${referral.assigned_counselor_id}"
                                                        data-category="${escapeHtml(
                                                            referral.concern_category
                                                        )}"
                                                        data-priority="${escapeHtml(
                                                            referral.priority || "MEDIUM"
                                                        )}"
                                                    >
                                                        Create Counseling Case
                                                    </button>

                                                </div>

                                            </div>

                                        `

                                        : ""
                                }

                            </article>

                        `;

                    }
                ).join("");


            bindTriageButtons();
            bindAssignmentButtons();
            bindCaseInitiationButtons();

        }


        // =================================================
        // TRIAGE BUTTONS
        // =================================================

        function bindTriageButtons() {

            document
                .querySelectorAll(
                    ".review-referral-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                const referralId =
                                    button.dataset.id;


                                const form =
                                    document.getElementById(
                                        `triageForm-${referralId}`
                                    );


                                form.classList.remove(
                                    "hidden"
                                );


                                button.classList.add(
                                    "hidden"
                                );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".cancel-triage-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                const referralId =
                                    button.dataset.id;


                                document
                                    .getElementById(
                                        `triageForm-${referralId}`
                                    )
                                    .classList.add(
                                        "hidden"
                                    );


                                document
                                    .querySelector(
                                        `.review-referral-button[data-id="${referralId}"]`
                                    )
                                    ?.classList.remove(
                                        "hidden"
                                    );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".complete-triage-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                completeTriage(
                                    button.dataset.id,
                                    button
                                );

                            }
                        );

                    }
                );

        }


        // =================================================
        // COMPLETE TRIAGE
        // =================================================

        async function completeTriage(
            referralId,
            button
        ) {

            const priority =
                document
                    .getElementById(
                        `triagePriority-${referralId}`
                    )
                    .value;


            const notes =
                document
                    .getElementById(
                        `triageNotes-${referralId}`
                    )
                    .value
                    .trim();


            if (!priority) {

                showMessage(
                    "Please select a triage priority before completing the review.",
                    "error"
                );

                return;

            }


            button.disabled =
                true;

            button.textContent =
                "Completing Triage...";


            try {

                const payload = {

                    priority:
                        priority,

                    triage_notes:
                        notes

                };


                await apiRequest(
                    `/referrals/${referralId}/triage`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify(
                                payload
                            )
                    }
                );


                showMessage(
                    "Referral triage completed successfully.",
                    "success"
                );


                await loadReferralQueue();


            } catch (error) {

                console.error(
                    "Unable to complete referral triage:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to complete referral triage.",
                    "error"
                );


                button.disabled =
                    false;

                button.textContent =
                    "Complete Triage";

            }

        }


        // =================================================
        // COUNSELOR ASSIGNMENT BUTTONS
        // =================================================

        function bindAssignmentButtons() {

            document
                .querySelectorAll(
                    ".assign-counselor-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            async () => {

                                const referralId =
                                    button.dataset.id;


                                const form =
                                    document.getElementById(
                                        `assignmentForm-${referralId}`
                                    );


                                form.classList.remove(
                                    "hidden"
                                );


                                button.classList.add(
                                    "hidden"
                                );


                                await loadCounselorsForAssignment(
                                    referralId
                                );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".cancel-assignment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                const referralId =
                                    button.dataset.id;


                                document
                                    .getElementById(
                                        `assignmentForm-${referralId}`
                                    )
                                    .classList.add(
                                        "hidden"
                                    );


                                document
                                    .querySelector(
                                        `.assign-counselor-button[data-id="${referralId}"]`
                                    )
                                    ?.classList.remove(
                                        "hidden"
                                    );

                            }
                        );

                    }
                );


            document
                .querySelectorAll(
                    ".confirm-assignment-button"
                )
                .forEach(
                    button => {

                        button.addEventListener(
                            "click",
                            () => {

                                assignCounselor(
                                    button.dataset.id,
                                    button
                                );

                            }
                        );

                    }
                );

        }


        // =================================================
        // LOAD COUNSELORS
        // =================================================

        async function loadCounselorsForAssignment(
            referralId
        ) {

            const select =
                document.getElementById(
                    `counselorSelect-${referralId}`
                );


            if (!select) {

                console.error(
                    "Counselor select element was not found."
                );

                return;
            }


            select.innerHTML = `

                <option value="">
                    Loading counselors...
                </option>

            `;


            try {

                console.log(
                    "Loading counselors for referral:",
                    referralId
                );


                const data =
                    await apiRequest(
                        "/counselors"
                    );


                console.log(
                    "COUNSELORS RESPONSE:",
                    data
                );


                /*
                 * Support the common response formats:
                 *
                 * {
                 *     counselors: [...]
                 * }
                 *
                 * {
                 *     items: [...]
                 * }
                 *
                 * [...]
                 */

                let counselors = [];


                if (Array.isArray(data)) {

                    counselors =
                        data;

                } else if (
                    Array.isArray(
                        data.counselors
                    )
                ) {

                    counselors =
                        data.counselors;

                } else if (
                    Array.isArray(
                        data.items
                    )
                ) {

                    counselors =
                        data.items;

                }


                select.innerHTML = `

                    <option value="">
                        Select counselor
                    </option>

                `;


                counselors.forEach(
                    counselor => {

                        const option =
                            document.createElement(
                                "option"
                            );


                        option.value =
                            counselor.id;


                        let counselorName =
                            counselor.full_name ||
                            counselor.name ||
                            "";


                        if (
                            !counselorName &&
                            counselor.user
                        ) {

                            counselorName =
                                counselor.user.full_name ||
                                counselor.user.name ||
                                [
                                    counselor.user.first_name,
                                    counselor.user.last_name
                                ]
                                    .filter(Boolean)
                                    .join(" ");

                        }


                        if (!counselorName) {

                            counselorName =
                                [
                                    counselor.first_name,
                                    counselor.last_name
                                ]
                                    .filter(Boolean)
                                    .join(" ");

                        }


                        if (!counselorName) {

                            counselorName =
                                `Counselor ${counselor.id}`;

                        }


                        option.textContent =
                            counselorName;


                        select.appendChild(
                            option
                        );

                    }
                );


                if (
                    counselors.length === 0
                ) {

                    select.innerHTML = `

                        <option value="">
                            No active counselors available
                        </option>

                    `;

                }


            } catch (error) {

                console.error(
                    "Unable to load counselors:",
                    error
                );


                select.innerHTML = `

                    <option value="">
                        Unable to load counselors
                    </option>

                `;


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to load the counselor list.",
                    "error"
                );

            }

        }


        // =================================================
        // ASSIGN COUNSELOR
        // =================================================

        async function assignCounselor(
            referralId,
            button
        ) {

            const select =
                document.getElementById(
                    `counselorSelect-${referralId}`
                );


            const counselorId =
                select?.value;


            if (!counselorId) {

                showMessage(
                    "Please select a counselor before confirming the assignment.",
                    "error"
                );

                return;

            }


            button.disabled =
                true;

            button.textContent =
                "Assigning...";


            try {

                const payload = {

                    counselor_id:
                        Number(
                            counselorId
                        )

                };


                await apiRequest(
                    `/referrals/${referralId}/assign`,
                    {
                        method: "PATCH",

                        body:
                            JSON.stringify(
                                payload
                            )
                    }
                );


                showMessage(
                    "Referral assigned successfully.",
                    "success"
                );


                await loadReferralQueue();


            } catch (error) {

                console.error(
                    "Unable to assign counselor:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to assign the counselor.",
                    "error"
                );


                button.disabled =
                    false;

                button.textContent =
                    "Confirm Assignment";

            }

        }
        // =================================================
        // CASE INITIATION
        // =================================================

        function bindCaseInitiationButtons() {

            document
                .querySelectorAll(
                    ".create-case-button"
                )
                .forEach(
                    button => {

                        const referralId =
                            button.dataset.id;

                        loadStudentsForCase(
                            referralId
                        );


                        button.addEventListener(
                            "click",
                            () => {

                                createCounselingCase(
                                    referralId,
                                    button
                                );

                            }
                        );

                    }
                );

        }


        // =================================================
        // LOAD REGISTERED STUDENTS
        // =================================================

        async function loadStudentsForCase(
            referralId
        ) {

            const select =
                document.getElementById(
                    `caseStudent-${referralId}`
                );


            if (!select) {
                return;
            }


            select.innerHTML = `

                <option value="">
                    Loading students...
                </option>

            `;


            try {

                const data =
                    await apiRequest(
                        "/students"
                    );


                const students =
                    data.items || [];


                select.innerHTML = `

                    <option value="">
                        Select registered student
                    </option>

                `;


                students
                    .filter(
                        student =>
                            student.active !== false
                    )
                    .forEach(
                        student => {

                            const option =
                                document.createElement(
                                    "option"
                                );


                            option.value =
                                student.id;


                            const studentNumber =
                                student.student_number ||
                                "No student number";


                            const studentName =
                                student.full_name ||
                                [
                                    student.first_name,
                                    student.last_name
                                ]
                                    .filter(Boolean)
                                    .join(" ") ||
                                `Student ${student.id}`;


                            const program =
                                student.program
                                    ? student.program
                                    : "";


                            const yearLevel =
                                student.year_level
                                    ? `Year ${student.year_level}`
                                    : "";


                            const academicInfo =
                                [
                                    program,
                                    yearLevel
                                ]
                                    .filter(Boolean)
                                    .join(", ");


                            option.textContent =
                                academicInfo
                                    ? `${studentNumber} — ${studentName} (${academicInfo})`
                                    : `${studentNumber} — ${studentName}`;


                            select.appendChild(
                                option
                            );

                        }
                    );


                if (
                    select.options.length === 1
                ) {

                    select.innerHTML = `

                        <option value="">
                            No active students available
                        </option>

                    `;

                }


            } catch (error) {

                console.error(
                    "Unable to load students:",
                    error
                );


                select.innerHTML = `

                    <option value="">
                        Unable to load students
                    </option>

                `;


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to load the registered student list.",
                    "error"
                );

            }

        }


        // =================================================
        // CREATE COUNSELING CASE
        // =================================================

        async function createCounselingCase(
            referralId,
            button
        ) {

            hideMessage();


            const studentSelect =
                document.getElementById(
                    `caseStudent-${referralId}`
                );


            const intakeSummaryElement =
                document.getElementById(
                    `caseIntakeSummary-${referralId}`
                );


            const studentId =
                studentSelect?.value;


            const intakeSummary =
                intakeSummaryElement?.value
                    .trim() || "";


            const counselorId =
                button.dataset.counselorId;


            const category =
                button.dataset.category;


            const priority =
                button.dataset.priority ||
                "MEDIUM";


            // ---------------------------------------------
            // VALIDATION
            // ---------------------------------------------

            if (!studentId) {

                showMessage(
                    "Please select the registered student associated with this referral.",
                    "error"
                );

                studentSelect?.focus();

                return;

            }


            if (!counselorId) {

                showMessage(
                    "This referral does not have an assigned counselor.",
                    "error"
                );

                return;

            }


            if (!category) {

                showMessage(
                    "The referral does not contain a valid case category.",
                    "error"
                );

                return;

            }


            // ---------------------------------------------
            // REQUEST
            // ---------------------------------------------

            const payload = {

                student_id:
                    Number(
                        studentId
                    ),

                counselor_id:
                    Number(
                        counselorId
                    ),

                referral_id:
                    Number(
                        referralId
                    ),

                category:
                    category,

                priority:
                    priority,

                intake_summary:
                    intakeSummary

            };


            button.disabled =
                true;

            button.textContent =
                "Creating Case...";


            try {

                const data =
                    await apiRequest(
                        "/cases",
                        {
                            method: "POST",

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                console.log(
                    "CASE CREATED:",
                    data
                );


                const caseNumber =
                    data?.case?.case_number;


                showMessage(
                    caseNumber
                        ? `Counseling case ${caseNumber} created successfully.`
                        : "Counseling case created successfully.",
                    "success"
                );


                /*
                * The backend changes the referral from
                * ASSIGNED -> CLOSED after case creation.
                *
                * Reloading the queue will therefore update
                * the referral card automatically.
                */

                await loadReferralQueue();


            } catch (error) {

                console.error(
                    "Unable to create counseling case:",
                    error
                );


                showMessage(
                    error?.data?.message ||
                    error?.data?.error ||
                    "Unable to create the counseling case.",
                    "error"
                );


                button.disabled =
                    false;

                button.textContent =
                    "Create Counseling Case";

            }

        }        

        // =================================================
        // HELPERS
        // =================================================

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


        function hideMessage() {

            if (!messageBox) {
                return;
            }


            messageBox.textContent =
                "";


            messageBox.className =
                "message hidden";

        }


        function formatReferralStatus(
            status
        ) {

            if (!status) {
                return "—";
            }


            return String(
                status
            )
                .replaceAll(
                    "_",
                    " "
                )
                .toLowerCase()
                .replace(
                    /\b\w/g,
                    letter =>
                        letter.toUpperCase()
                );

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

        // =================================================
        // SHARED SIDEBAR NAVIGATION
        // =================================================

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



        if (casesNav) {

            casesNav.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "/cases";

                }
            );

        }



        // Referrals is the current page,
        // so referralsNav does not need a click handler.



        if (exitNav) {

            exitNav.addEventListener(
                "click",
                () => {

                    if (
                        userRole === "admin" ||
                        userRole === "head_counselor" ||
                        userRole === "staff"
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
                        userRole === "admin"
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
        
        // =================================================
        // INITIAL LOAD
        // =================================================

        if (isHeadCounselor) {

            loadReferralQueue();

        }

    }
);
